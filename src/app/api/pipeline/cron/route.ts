import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { triageAsset } from "@/lib/pipeline/triage";
import { runAllPipelines } from "@/lib/pipeline/orchestrator";
import { refreshExpiringTokens } from "@/lib/pipeline/token-refresh";
import { extractExif, fetchAndConvert } from "@/lib/image-utils";
import { matchAssetToEntities } from "@/lib/geo-match";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Process a single asset end-to-end. Called concurrently in batches
 * of 5 from the cron handler. Each call is independent — no shared
 * state between assets.
 *
 * Pipeline: HEIC → EXIF → geo-match → project tag → triage (includes
 * text gen) → face detect → render variants
 *
 * Text generation (pin_headline, display_caption, alt_text, social_hook)
 * is merged INTO the triage vision call — one API call per asset instead
 * of two. The triage prompt returns all analysis + text outputs.
 */
async function processOneAsset(
  asset: Record<string, unknown>,
  sqlFn: typeof sql,
): Promise<boolean> {
  const assetId = asset.id as string;
  const siteId = asset.site_id as string;
  const meta = (asset.metadata || {}) as Record<string, unknown>;
  const mediaType = asset.media_type as string;
  const storageUrl = asset.storage_url as string;

  try {
    // ── HEIC conversion ──
    let currentUrl = storageUrl;
    if (meta.needs_conversion && (storageUrl.endsWith(".heic") || storageUrl.endsWith(".heif"))) {
      const { data, mimeType } = await fetchAndConvert(storageUrl);
      const date = new Date().toISOString().slice(0, 10);
      const fname = seoFilename("upload", "jpg");
      const key = `sites/${siteId}/${date}/${fname}`;
      currentUrl = await uploadBufferToR2(key, data, mimeType);
      await sqlFn`
        UPDATE media_assets
        SET storage_url = ${currentUrl},
            metadata = (COALESCE(metadata, '{}'::jsonb) - 'needs_conversion') || '{"converted": true}'::jsonb
        WHERE id = ${assetId}
      `;
      const heicKey = (await import("@/lib/r2")).keyFromStorageUrl(storageUrl);
      if (heicKey) {
        try { await (await import("@/lib/r2")).deleteObjectFromR2(heicKey); }
        catch { /* non-fatal */ }
      }
    }

    // ── Filename date fallback (video, etc.) ──
    if (!mediaType?.startsWith("image") && !meta.date_taken) {
      const fileDate = parseDateFromFilename((meta.original_filename as string) || storageUrl);
      if (fileDate) {
        const sortOrder = new Date(fileDate).getTime() / 1000;
        await sqlFn`
          UPDATE media_assets
          SET date_taken = ${fileDate}, sort_order = ${sortOrder},
              metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ date_taken: fileDate })}::jsonb
          WHERE id = ${assetId}
        `;
      }
    }

    // ── EXIF extraction ──
    if (mediaType?.startsWith("image") && !meta.date_taken) {
      const exifUrl = currentUrl;
      let exif = await extractExif(exifUrl);
      if (!exif.dateTaken) {
        const fileDate = parseDateFromFilename((meta.original_filename as string) || storageUrl);
        if (fileDate) exif = { ...exif, dateTaken: fileDate };
      }
      if (exif.dateTaken || exif.lat !== null) {
        const exifMeta: Record<string, unknown> = {
          ...(exif.dateTaken && { date_taken: exif.dateTaken }),
          ...(exif.lat !== null && { geo: { lat: exif.lat, lng: exif.lng } }),
          ...(exif.camera && { camera: exif.camera }),
        };
        const sortOrder = exif.dateTaken ? new Date(exif.dateTaken).getTime() / 1000 : null;
        await sqlFn`
          UPDATE media_assets
          SET date_taken = ${exif.dateTaken},
              sort_order = COALESCE(${sortOrder}, sort_order),
              metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(exifMeta)}::jsonb
          WHERE id = ${assetId}
        `;
        if (exif.lat !== null && exif.lng !== null) {
          await matchAssetToEntities(assetId, siteId, exif.lat, exif.lng).catch(() => {});
        }
      }
    }

    // ── Project tagging ──
    const pendingProjectId = meta.pending_project_id as string | undefined;
    if (pendingProjectId) {
      await sqlFn`
        INSERT INTO asset_projects (asset_id, project_id)
        VALUES (${assetId}, ${pendingProjectId})
        ON CONFLICT DO NOTHING
      `;
      await sqlFn`
        UPDATE media_assets SET metadata = metadata - 'pending_project_id'
        WHERE id = ${assetId}
      `;
    }

    // ── Triage (includes text generation — merged vision call) ──
    await triageAsset(assetId);

    // ── Face detection (30s timeout — must not block render) ──
    if (mediaType?.startsWith("image") && !meta.faces) {
      const [triaged] = await sqlFn`SELECT ai_analysis FROM media_assets WHERE id = ${assetId}`;
      const analysis = (triaged?.ai_analysis || {}) as Record<string, unknown>;
      if (analysis.has_faces) {
        try {
          const { processFaces } = await import("@/lib/face-detect");
          await Promise.race([
            processFaces(assetId, siteId, currentUrl),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Face detection timed out (30s)")), 30000)),
          ]);
        } catch (err) {
          console.error(`Face detection failed for ${assetId}:`, err instanceof Error ? err.message : err);
        }
      }
    }

    // ── Render variants (reads pin_headline from triage-generated text) ──
    if (mediaType?.startsWith("image")) {
      try {
        const { renderAssetVariants } = await import("@/lib/pipeline/render-step");
        const renderResult = await renderAssetVariants(assetId);
        // Diagnostic: write render outcome to metadata so we can audit without Vercel logs
        await sqlFn`
          UPDATE media_assets
          SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ render_diagnostic: renderResult })}::jsonb
          WHERE id = ${assetId}
        `;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Render failed for ${assetId}:`, errMsg);
        await sqlFn`
          UPDATE media_assets
          SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ render_diagnostic: { error: errMsg } })}::jsonb
          WHERE id = ${assetId}
        `.catch(() => {});
      }
    }

    return true;
  } catch (err) {
    console.error(`Asset processing failed for ${assetId}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Parse date from common camera filename patterns.
 */
function parseDateFromFilename(urlOrFilename: string): string | null {
  const filename = decodeURIComponent(urlOrFilename.split("/").pop()?.split("?")[0] || "");
  const match = filename.match(/(\d{4})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])_(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const [, year, month, day, hour, min, sec] = match;
    const date = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && date <= new Date()) {
      return date.toISOString();
    }
  }
  const dashMatch = filename.match(/(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])/);
  if (dashMatch) {
    const date = new Date(`${dashMatch[0]}T00:00:00`);
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && date <= new Date()) {
      return date.toISOString();
    }
  }
  return null;
}

/**
 * GET /api/pipeline/cron — Runs every 15 minutes (Vercel cron).
 *
 * 1. Process new assets: EXIF extraction, geo-match, project tagging, triage
 * 2. Refresh expiring social tokens
 * 3. Run autopilot pipelines for all enabled sites
 */
export async function GET(req: NextRequest) {
  // Verify cron secret if configured. Vercel sends it as Authorization: Bearer <CRON_SECRET>
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // ── 1. Process new assets ──
    // Pick up assets at "received" older than 30 seconds.
    // Process up to 50 per run with 5-at-a-time concurrency.
    // With merged triage+text gen (one vision call), each asset
    // takes ~15s. 10 groups of 5 × 15s = ~150s (under 300s limit).
    const pending = await sql`
      SELECT id, site_id, storage_url, media_type, metadata
      FROM media_assets
      WHERE triage_status = 'received'
        AND created_at < NOW() - INTERVAL '30 seconds'
      ORDER BY created_at ASC
      LIMIT 50
    `;

    let processed = 0;
    let processErrors = 0;

    // Process in concurrent batches of 5
    const CONCURRENCY = 5;
    for (let batchStart = 0; batchStart < pending.length; batchStart += CONCURRENCY) {
      const batch = pending.slice(batchStart, batchStart + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map((asset) => processOneAsset(asset, sql)),
      );
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) processed++;
        else processErrors++;
      }
    }

    // processOneAsset handles everything in the old serial loop
    // but is now called concurrently in batches of 5 above.

    // ── 1b. Check autopilot activation for processed sites ──
    if (processed > 0) {
      const processedSiteIds = [...new Set(pending.map((a) => a.site_id as string))];
      for (const sid of processedSiteIds) {
        try {
          const { checkAndActivateAutopilot } = await import("@/lib/pipeline/autopilot-check");
          await checkAndActivateAutopilot(sid);
        } catch (err) {
          console.error(`Autopilot check failed for ${sid}:`, err instanceof Error ? err.message : err);
        }
      }
    }

    // ── 2. Refresh expiring + recover expired tokens ──
    const tokenResult = await refreshExpiringTokens();
    try {
      const { forceRefreshExpired } = await import("@/lib/pipeline/token-refresh");
      const recovered = await forceRefreshExpired();
      if (recovered.recovered > 0) {
        console.log(`Recovered ${recovered.recovered} expired tokens`);
      }
    } catch (err) {
      console.error("Token recovery failed:", err instanceof Error ? err.message : err);
    }

    // ── 2b. Asset health check (post-refresh, so we use fresh tokens) ──
    let healthSummary: Record<string, number> | null = null;
    try {
      const { checkAllAssetHealth } = await import("@/lib/pipeline/asset-health");
      healthSummary = await checkAllAssetHealth();
      console.log("Asset health summary:", healthSummary);
    } catch (err) {
      console.error("Asset health check failed:", err instanceof Error ? err.message : err);
    }

    // ── 3. Autopilot publishing ──
    // Replaces the old slot-based pipeline. For each active site with
    // autopilot enabled, evaluate cadence rules and publish immediately
    // if conditions are met. No slots, no drafts, no approval.
    const autopilotSites = await sql`
      SELECT id FROM sites WHERE autopilot_enabled = true AND is_active = true
    `;
    const publishResults: Array<{ siteId: string; results: unknown[] }> = [];
    for (const site of autopilotSites) {
      try {
        const { autopilotPublish } = await import("@/lib/pipeline/autopilot-publisher");
        const results = await autopilotPublish(site.id as string);
        publishResults.push({ siteId: site.id as string, results });
      } catch (err) {
        console.error(`Autopilot publish failed for ${site.id}:`, err instanceof Error ? err.message : err);
      }
    }

    // ── 4. Legacy pipeline (blog promotion, etc.) ──
    const results = await runAllPipelines();

    const totalPublished = publishResults.reduce(
      (n, s) => n + (s.results as Array<{ published: boolean }>).filter((r) => r.published).length, 0,
    );
    const totalQuarantined = publishResults.reduce(
      (n, s) => n + (s.results as Array<{ quarantined?: boolean }>).filter((r) => r.quarantined).length, 0,
    );

    const summary = {
      assets_processed: processed,
      assets_errors: processErrors,
      assets_remaining: pending.length === 50 ? "50+" : 0,
      autopilot_sites: autopilotSites.length,
      autopilot_published: totalPublished,
      autopilot_quarantined: totalQuarantined,
      legacy_sites: results.length,
      legacy_blogs: results.reduce((n, r) => n + r.blogPostsGenerated, 0),
      tokens_refreshed: tokenResult.refreshed,
      tokens_failed: tokenResult.failed,
      asset_health: healthSummary,
    };

    return NextResponse.json({ summary, publishResults });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
