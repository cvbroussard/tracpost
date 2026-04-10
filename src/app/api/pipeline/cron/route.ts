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
    // Pick up assets at "received" older than 30 seconds (give the API time to finish)
    // Process up to 30 per run
    const pending = await sql`
      SELECT id, site_id, storage_url, media_type, metadata
      FROM media_assets
      WHERE triage_status = 'received'
        AND created_at < NOW() - INTERVAL '30 seconds'
      ORDER BY created_at ASC
      LIMIT 30
    `;

    let processed = 0;
    let processErrors = 0;

    for (const asset of pending) {
      try {
        const assetId = asset.id as string;
        const siteId = asset.site_id as string;
        const meta = (asset.metadata || {}) as Record<string, unknown>;
        const mediaType = asset.media_type as string;
        const storageUrl = asset.storage_url as string;

        // ── HEIC conversion ──
        let currentUrl = storageUrl;
        if (meta.needs_conversion && (storageUrl.endsWith(".heic") || storageUrl.endsWith(".heif"))) {
          try {
            const { data, mimeType } = await fetchAndConvert(storageUrl);
            const date = new Date().toISOString().slice(0, 10);
            const fname = seoFilename("upload", "jpg");
            const key = `sites/${siteId}/${date}/${fname}`;
            currentUrl = await uploadBufferToR2(key, data, mimeType);
            await sql`
              UPDATE media_assets
              SET storage_url = ${currentUrl},
                  metadata = (COALESCE(metadata, '{}'::jsonb) - 'needs_conversion') || '{"converted": true}'::jsonb
              WHERE id = ${assetId}
            `;
          } catch (err) {
            console.error(`HEIC conversion failed for ${assetId}:`, err instanceof Error ? err.message : err);
          }
        }

        // ── Filename date fallback for non-image assets (video, etc.) ──
        if (!mediaType?.startsWith("image") && !meta.date_taken) {
          const fileDate = parseDateFromFilename((meta.original_filename as string) || storageUrl);
          if (fileDate) {
            const sortOrder = new Date(fileDate).getTime() / 1000;
            await sql`
              UPDATE media_assets
              SET date_taken = ${fileDate},
                  sort_order = ${sortOrder},
                  metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ date_taken: fileDate })}::jsonb
              WHERE id = ${assetId}
            `;
          }
        }

        // ── EXIF extraction ──
        if (mediaType?.startsWith("image") && !meta.date_taken) {
          // For HEIC: extract from original URL (before conversion stripped EXIF)
          const exifUrl = (storageUrl.endsWith(".heic") || storageUrl.endsWith(".heif")) ? storageUrl : currentUrl;
          let exif = await extractExif(exifUrl);

          // Fallback: filename date parsing
          if (!exif.dateTaken) {
            const originalFilename = (meta.original_filename as string) || storageUrl;
            const fileDate = parseDateFromFilename(originalFilename);
            if (fileDate) exif = { ...exif, dateTaken: fileDate };
          }

          if (exif.dateTaken || exif.lat !== null) {
            const exifMeta: Record<string, unknown> = {
              ...(exif.dateTaken && { date_taken: exif.dateTaken }),
              ...(exif.lat !== null && { geo: { lat: exif.lat, lng: exif.lng } }),
              ...(exif.camera && { camera: exif.camera }),
            };
            const sortOrder = exif.dateTaken ? new Date(exif.dateTaken).getTime() / 1000 : null;
            await sql`
              UPDATE media_assets
              SET date_taken = ${exif.dateTaken},
                  sort_order = COALESCE(${sortOrder}, sort_order),
                  metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(exifMeta)}::jsonb
              WHERE id = ${assetId}
            `;

            // ── Geo-match to locations/projects ──
            if (exif.lat !== null && exif.lng !== null) {
              await matchAssetToEntities(assetId, siteId, exif.lat, exif.lng).catch(() => {});
            }
          }
        }

        // ── Project tagging (from upload context) ──
        const pendingProjectId = meta.pending_project_id as string | undefined;
        if (pendingProjectId) {
          await sql`
            INSERT INTO asset_projects (asset_id, project_id)
            VALUES (${assetId}, ${pendingProjectId})
            ON CONFLICT DO NOTHING
          `;
          // Clear the pending flag
          await sql`
            UPDATE media_assets
            SET metadata = metadata - 'pending_project_id'
            WHERE id = ${assetId}
          `;
        }

        // ── Triage ──
        await triageAsset(assetId);

        // ── Face detection — only if triage detected faces ──
        if (mediaType?.startsWith("image") && !meta.faces) {
          const [triaged] = await sql`SELECT ai_analysis FROM media_assets WHERE id = ${assetId}`;
          const analysis = (triaged?.ai_analysis || {}) as Record<string, unknown>;
          if (analysis.has_faces) {
            try {
              const { processFaces } = await import("@/lib/face-detect");
              await processFaces(assetId, siteId, currentUrl);
            } catch (err) {
              console.error(`Face detection failed for ${assetId}:`, err instanceof Error ? err.message : err);
            }
          }
        }

        processed++;
      } catch (err) {
        processErrors++;
        console.error(`Asset processing failed for ${asset.id}:`, err instanceof Error ? err.message : err);
      }

      // Delay between assets to avoid rate limiting
      if (pending.length > 5) await new Promise((r) => setTimeout(r, 500));
    }

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

    // ── 2. Refresh expiring tokens ──
    const tokenResult = await refreshExpiringTokens();

    // ── 3. Run all pipelines ──
    const results = await runAllPipelines();

    const summary = {
      assets_processed: processed,
      assets_errors: processErrors,
      assets_remaining: pending.length === 30 ? "30+" : 0,
      sites_processed: results.length,
      total_triaged: results.reduce((n, r) => n + r.assetsTriaged, 0),
      total_slots_generated: results.reduce((n, r) => n + r.slotsGenerated, 0),
      total_slots_filled: results.reduce((n, r) => n + r.slotsFilled, 0),
      total_captions: results.reduce((n, r) => n + r.captionsGenerated, 0),
      total_published: results.reduce((n, r) => n + r.postsPublished, 0),
      total_failed: results.reduce((n, r) => n + r.postsFailed, 0),
      tokens_refreshed: tokenResult.refreshed,
      tokens_failed: tokenResult.failed,
      errors: results.flatMap((r) => r.errors),
    };

    return NextResponse.json({ summary, results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
