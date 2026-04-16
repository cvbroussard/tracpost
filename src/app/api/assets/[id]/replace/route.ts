import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import {
  uploadBufferToR2,
  createPresignedReplaceUrl,
  keyFromStorageUrl,
} from "@/lib/r2";

export const runtime = "nodejs";
// Images pass through the server body (capped by Vercel at ~4.5MB).
// Videos skip the body entirely via the presigned PUT path below.
export const maxDuration = 60;

/**
 * In-place replacement of a media asset's bytes. The R2 object at
 * the existing key is overwritten — storage_url and media_assets.id
 * stay identical, so every reference (blog body <img>, og_image_url,
 * schema.org JSON-LD, social_posts arrays) keeps resolving. AI
 * metadata (quality_score, ai_analysis) is intentionally preserved
 * — the tenant chose a contextually-similar replacement.
 *
 * POST /api/assets/:id/replace
 *   - multipart/form-data with `file` field → server-side upload (images)
 *   - application/json { contentType, sizeBytes } → returns presigned PUT
 *     URL for client-direct upload (videos)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const [asset] = await sql`
    SELECT ma.id, ma.storage_url, ma.media_type
    FROM media_assets ma
    JOIN sites s ON ma.site_id = s.id
    WHERE ma.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const key = asset.storage_url ? keyFromStorageUrl(String(asset.storage_url)) : null;
  if (!key) {
    return NextResponse.json({ error: "Asset has no R2 storage URL" }, { status: 400 });
  }

  const existingFamily = mediaFamily(String(asset.media_type || ""));
  const contentTypeHeader = req.headers.get("content-type") || "";

  // ── Video path: JSON request → presigned PUT URL
  if (contentTypeHeader.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    const newContentType = String(body.contentType || "");
    const sizeBytes = Number(body.sizeBytes) || undefined;

    if (!newContentType) {
      return NextResponse.json({ error: "contentType required" }, { status: 400 });
    }
    if (mediaFamily(newContentType) !== existingFamily) {
      return NextResponse.json(
        { error: `Cannot swap ${existingFamily} with ${mediaFamily(newContentType)}` },
        { status: 400 },
      );
    }

    const uploadUrl = await createPresignedReplaceUrl({
      key,
      contentType: newContentType,
      maxSizeBytes: sizeBytes,
    });

    // Client-direct upload. Row is untouched — storage_url / id
    // stay stable by design, and there's no updated_at column on
    // media_assets today (nothing to bump).
    return NextResponse.json({ uploadUrl, key });
  }

  // ── Image path: multipart → server-side upload
  if (!contentTypeHeader.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Content-Type must be multipart/form-data (images) or application/json (videos)" },
      { status: 400 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file field required" }, { status: 400 });
  }

  // Browsers send application/octet-stream for HEIC/HEIF from iPhone,
  // and occasionally empty for other edge cases. Fall back to sniffing
  // the filename extension before we reject as "other".
  const reportedType = file.type || "";
  const newContentType = resolveContentType(reportedType, file.name);

  if (mediaFamily(newContentType) !== existingFamily) {
    return NextResponse.json(
      { error: `Cannot swap ${existingFamily} with ${mediaFamily(newContentType)} (reported type: ${reportedType || "none"}, filename: ${file.name})` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await uploadBufferToR2(key, buffer, newContentType);

  await sql`
    UPDATE media_assets
       SET media_type = ${newContentType}
     WHERE id = ${id}
  `;

  return NextResponse.json({ success: true, storage_url: asset.storage_url });
}

function mediaFamily(mediaType: string): "image" | "video" | "other" {
  if (mediaType.startsWith("image")) return "image";
  if (mediaType.startsWith("video")) return "video";
  return "other";
}

const EXTENSION_TO_MIME: Record<string, string> = {
  heic: "image/heic",
  heif: "image/heif",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  png:  "image/png",
  webp: "image/webp",
  gif:  "image/gif",
  avif: "image/avif",
  tif:  "image/tiff",
  tiff: "image/tiff",
  mp4:  "video/mp4",
  mov:  "video/quicktime",
  webm: "video/webm",
  m4v:  "video/mp4",
};

function resolveContentType(reported: string, filename: string): string {
  // Trust the browser when it gave us something specific
  if (reported && reported !== "application/octet-stream") return reported;
  const ext = filename.toLowerCase().split(".").pop() || "";
  return EXTENSION_TO_MIME[ext] || reported || "application/octet-stream";
}
