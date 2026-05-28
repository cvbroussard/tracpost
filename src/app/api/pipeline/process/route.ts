import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { extractExif } from "@/lib/image-utils";
import { matchAssetToEntities } from "@/lib/geo-match";

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
  return null;
}

/**
 * POST /api/pipeline/process — Process pending assets for the authenticated user's site.
 * Called automatically after upload batch completes. Authenticated (not cron).
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json().catch(() => ({}));
  const siteId = body.site_id;

  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  // Verify ownership
  const [site] = await sql`
    SELECT id FROM businesses WHERE id = ${siteId} AND billing_account_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const pending = await sql`
    SELECT id, business_id, storage_url, media_type, metadata
    FROM media_assets
    WHERE business_id = ${siteId}
      AND processing_stage = 'onboarded'
      AND ai_analysis IS NULL
    ORDER BY created_at ASC
    LIMIT 50
  `;

  let processed = 0;
  let errors = 0;

  for (const asset of pending) {
    try {
      const assetId = asset.id as string;
      const meta = (asset.metadata || {}) as Record<string, unknown>;
      const mediaType = asset.media_type as string;
      const storageUrl = asset.storage_url as string;

      // NOTE: HEIC conversion previously ran here. Moved inline to upload
      // POST waitUntil (2026-05-09) — browsers can't render HEIC, so the
      // asset is unbriefable until conversion finishes; deferring it to the
      // batch-after-upload tick was a pointless hop. See heic-convert.ts.
      const currentUrl = storageUrl;

      // Filename date fallback for non-image assets (video, etc.)
      if (!mediaType?.startsWith("image") && !meta.date_taken) {
        const fileDate = parseDateFromFilename((meta.original_filename as string) || storageUrl);
        if (fileDate) {
          await sql`
            UPDATE media_assets
            SET date_taken = ${fileDate},
                metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ date_taken: fileDate })}::jsonb
            WHERE id = ${assetId}
          `;
        }
      }

      // EXIF extraction — always use currentUrl (original HEIC is already deleted)
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
            ...(exif.camera && { camera: exif.camera }),
          };
          // GPS goes to first-class columns (gps_lat, gps_lng) only.
          // The legacy metadata.geo write was retired 2026-05-19 — all
          // downstream readers (geo-match, project-match service-area,
          // render) now read from columns. date_taken and camera stay
          // in metadata since they don't have dedicated columns.
          // Update date_taken and recalculate sort_order from real photo date.
          const sortOrder = exif.dateTaken ? new Date(exif.dateTaken).getTime() / 1000 : null;
          await sql`
            UPDATE media_assets
            SET date_taken = ${exif.dateTaken},
                sort_order = COALESCE(${sortOrder}, sort_order),
                gps_lat = COALESCE(${exif.lat}, gps_lat),
                gps_lng = COALESCE(${exif.lng}, gps_lng),
                metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(exifMeta)}::jsonb
            WHERE id = ${assetId}
          `;

          if (exif.lat !== null && exif.lng !== null) {
            await matchAssetToEntities(assetId, siteId, exif.lat, exif.lng).catch(() => {});
          }
        }
      }

      // Project tagging
      const pendingProjectId = meta.pending_project_id as string | undefined;
      if (pendingProjectId) {
        await sql`
          INSERT INTO asset_projects (asset_id, project_id)
          VALUES (${assetId}, ${pendingProjectId})
          ON CONFLICT DO NOTHING
        `;
        await sql`
          UPDATE media_assets SET metadata = metadata - 'pending_project_id' WHERE id = ${assetId}
        `;
      }

      // NOTE: Vision triage, face detection, and variant render previously ran
      // here — moved to briefing-flip via processBriefedAsset (LOCKED 2026-05-08).
      // Triage now runs WITH subscriber context (caption + pillar + brands +
      // project), so AI returns a context-aware url_slug rather than guessing
      // from pixels alone. Until the subscriber briefs the asset it stays in
      // onboarded with deterministic prep (HEIC / EXIF / project tag)
      // already done above, ready for the briefing-flip pipeline to take over.

      processed++;
    } catch (err) {
      errors++;
      console.error(`Process failed for ${asset.id}:`, err instanceof Error ? err.message : err);
    }
  }

  // Check autopilot activation once after processing the batch
  if (processed > 0) {
    try {
      const { checkAndActivateAutopilot } = await import("@/lib/pipeline/autopilot-check");
      await checkAndActivateAutopilot(siteId);
    } catch (err) {
      console.error(`Autopilot check failed for ${siteId}:`, err instanceof Error ? err.message : err);
    }
  }

  return NextResponse.json({ processed, errors, total: pending.length });
}
