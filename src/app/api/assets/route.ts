import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline/orchestrator";
import { fetchAndConvert } from "@/lib/image-utils";
import { uploadBufferToR2 } from "@/lib/r2";
import { seoFilename } from "@/lib/seo-filename";

/**
 * Parse date from common camera filename patterns.
 * Covers: 20201120_161314404_iOS, IMG_20201120_161314, PXL_20201120_161314
 */
function parseDateFromFilename(urlOrFilename: string): string | null {
  // Extract filename from URL
  const filename = decodeURIComponent(urlOrFilename.split("/").pop()?.split("?")[0] || "");

  // Pattern: YYYYMMDD_HHMMSS (iOS, Android, Pixel)
  const match = filename.match(/(\d{4})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])_(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const [, year, month, day, hour, min, sec] = match;
    const date = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
    if (!isNaN(date.getTime()) && date.getFullYear() >= 2000 && date <= new Date()) {
      return date.toISOString();
    }
  }

  // Pattern: YYYY-MM-DD (in filename or path)
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
 * POST /api/assets — Register a new media asset.
 *
 * The mobile capture app or any client calls this after uploading
 * the file to object storage (R2/S3). This endpoint records the
 * asset metadata and sets triage_status = "received" to enter
 * the autopilot pipeline.
 *
 * Body: { site_id, storage_url, media_type, context_note?, metadata? }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const body = await req.json();
    const { site_id, media_type, context_note, metadata } = body;
    // Accept both "storage_url" and "url" (mobile app sends "url")
    const storage_url = body.storage_url || body.url;

    if (!site_id || !storage_url || !media_type) {
      return NextResponse.json(
        { error: "site_id, storage_url, and media_type are required" },
        { status: 400 }
      );
    }

    // Verify site belongs to this subscriber
    const [site] = await sql`
      SELECT id FROM sites
      WHERE id = ${site_id} AND subscription_id = ${auth.subscriptionId}
    `;

    if (!site) {
      return NextResponse.json(
        { error: "Site not found or not owned by subscriber" },
        { status: 404 }
      );
    }

    // Re-host external URLs to R2 — don't hot-link external sites
    let finalUrl = storage_url;
    if (storage_url && !storage_url.includes("assets.tracpost.com") && media_type === "image") {
      try {
        const imgRes = await fetch(storage_url, { signal: AbortSignal.timeout(15000) });
        if (imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const ext = contentType.includes("png") ? "png" : "jpg";
          const fname = seoFilename(context_note || "product-image", ext);
          const key = `sites/${site_id}/media/${fname}`;
          finalUrl = await uploadBufferToR2(key, buffer, contentType);
        }
      } catch (err) {
        console.warn("External image re-host failed, using original URL:", err instanceof Error ? err.message : err);
      }
    }

    // Convert HEIC/HEIF to JPEG — browsers can't display HEIC
    // Extract EXIF from original before conversion (conversion may strip it)
    let preConvertExif: { dateTaken: string | null; lat: number | null; lng: number | null; camera: string | null } | null = null;
    if (finalUrl && media_type === "image" && (
      finalUrl.endsWith(".heic") || finalUrl.endsWith(".heif")
    )) {
      try {
        const { extractExif } = await import("@/lib/image-utils");
        preConvertExif = await extractExif(finalUrl);
      } catch { /* ignore */ }

      try {
        const { data, mimeType } = await fetchAndConvert(finalUrl);
        const date = new Date().toISOString().slice(0, 10);
        const fname = seoFilename(context_note || "upload", "jpg");
        const key = `sites/${site_id}/${date}/${fname}`;
        finalUrl = await uploadBufferToR2(key, data, mimeType);
      } catch (err) {
        console.warn("HEIC conversion failed, using original:", err instanceof Error ? err.message : err);
      }
    }

    const [asset] = await sql`
      INSERT INTO media_assets (
        site_id, storage_url, media_type, context_note,
        source, triage_status, metadata
      )
      VALUES (
        ${site_id}, ${finalUrl}, ${media_type},
        ${context_note || null}, 'upload', 'received',
        ${JSON.stringify(metadata || {})}
      )
      RETURNING id, site_id, storage_url, media_type, context_note, triage_status, created_at
    `;

    // Log usage
    await sql`
      INSERT INTO usage_log (subscription_id, site_id, action, metadata)
      VALUES (${auth.subscriptionId}, ${site_id}, 'asset_upload', ${JSON.stringify({
        asset_id: asset.id,
        media_type,
      })})
    `;

    // Extract EXIF metadata + geo-match — non-blocking
    if (media_type?.startsWith("image")) {
      (async () => {
        try {
          // Use pre-convert EXIF (from HEIC original) if available, otherwise extract from stored file
          let exif = preConvertExif;
          if (!exif || (!exif.dateTaken && exif.lat === null)) {
            const { extractExif } = await import("@/lib/image-utils");
            exif = await extractExif(finalUrl);
          }

          // Fallback: parse date from filename (covers Google Photos drag-and-drop)
          if (!exif.dateTaken) {
            const fileDate = parseDateFromFilename(storage_url || finalUrl);
            if (fileDate) {
              exif = { ...exif, dateTaken: fileDate };
            }
          }

          if (exif.dateTaken || exif.lat !== null) {
            const exifMeta = {
              ...(exif.dateTaken && { date_taken: exif.dateTaken }),
              ...(exif.lat !== null && { geo: { lat: exif.lat, lng: exif.lng } }),
              ...(exif.camera && { camera: exif.camera }),
            };
            await sql`
              UPDATE media_assets
              SET date_taken = ${exif.dateTaken},
                  metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(exifMeta)}::jsonb
              WHERE id = ${asset.id}
            `;

            // Auto-associate with nearby locations/projects
            if (exif.lat !== null && exif.lng !== null) {
              const { matchAssetToEntities } = await import("@/lib/geo-match");
              await matchAssetToEntities(asset.id as string, site_id, exif.lat, exif.lng);
            }
          }
        } catch { /* ignore */ }
      })();
    }

    // Fire pipeline immediately — non-blocking (don't await)
    runPipeline(site_id).catch((err) =>
      console.error("Pipeline trigger after upload failed:", err)
    );

    return NextResponse.json({ asset }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/assets?site_id=xxx&status=received
 * List assets for a site, optionally filtered by triage_status.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const { searchParams } = new URL(req.url);
    const siteId = searchParams.get("site_id");
    const status = searchParams.get("status");

    if (!siteId) {
      return NextResponse.json(
        { error: "site_id query parameter is required" },
        { status: 400 }
      );
    }

    // Verify ownership
    const [site] = await sql`
      SELECT id FROM sites
      WHERE id = ${siteId} AND subscription_id = ${auth.subscriptionId}
    `;

    if (!site) {
      return NextResponse.json(
        { error: "Site not found or not owned by subscriber" },
        { status: 404 }
      );
    }

    let assets;
    if (status) {
      assets = await sql`
        SELECT id, storage_url, media_type, context_note, triage_status,
               quality_score, content_pillar, platform_fit, flag_reason,
               shelve_reason, source, created_at, triaged_at
        FROM media_assets
        WHERE site_id = ${siteId} AND triage_status = ${status}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    } else {
      assets = await sql`
        SELECT id, storage_url, media_type, context_note, triage_status,
               quality_score, content_pillar, platform_fit, flag_reason,
               shelve_reason, source, created_at, triaged_at
        FROM media_assets
        WHERE site_id = ${siteId}
        ORDER BY created_at DESC
        LIMIT 100
      `;
    }

    return NextResponse.json({ assets });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
