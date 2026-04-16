import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { triageAsset } from "@/lib/pipeline/triage";
import { extractExif, fetchAndConvert } from "@/lib/image-utils";
import { matchAssetToEntities } from "@/lib/geo-match";
import { uploadBufferToR2, deleteObjectFromR2, keyFromStorageUrl } from "@/lib/r2";
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
    SELECT id FROM sites WHERE id = ${siteId} AND subscription_id = ${auth.subscriptionId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const pending = await sql`
    SELECT id, site_id, storage_url, media_type, metadata
    FROM media_assets
    WHERE site_id = ${siteId} AND triage_status = 'received'
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

      // HEIC conversion — convert to JPEG, swap URL, delete original
      let currentUrl = storageUrl;
      if (meta.needs_conversion && (storageUrl.endsWith(".heic") || storageUrl.endsWith(".heif"))) {
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
        const heicKey = keyFromStorageUrl(storageUrl);
        if (heicKey) {
          try { await deleteObjectFromR2(heicKey); }
          catch (err) { console.error("HEIC cleanup failed (non-fatal):", err); }
        }
      }

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

      // EXIF extraction
      if (mediaType?.startsWith("image") && !meta.date_taken) {
        const exifUrl = (storageUrl.endsWith(".heic") || storageUrl.endsWith(".heif")) ? storageUrl : currentUrl;
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
          // Update date_taken and recalculate sort_order from the real photo date
          const sortOrder = exif.dateTaken ? new Date(exif.dateTaken).getTime() / 1000 : null;
          await sql`
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

      // Triage
      await triageAsset(assetId);

      // Face detection — only if triage detected faces (has_faces = true)
      if (mediaType?.startsWith("image") && !meta.faces) {
        const [triaged] = await sql`SELECT ai_analysis FROM media_assets WHERE id = ${assetId}`;
        const analysis = (triaged?.ai_analysis || {}) as Record<string, unknown>;
        if (analysis.has_faces) {
          try {
            const { processFaces } = await import("@/lib/face-detect");
            const faceResult = await processFaces(assetId, siteId, currentUrl);
            console.log(`Face detection for ${assetId}: ${faceResult.matched} matched, ${faceResult.unmatched} unmatched`);
          } catch (err) {
            console.error(`Face detection failed for ${assetId}:`, err instanceof Error ? err.message : err);
          }
        }
      }

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
