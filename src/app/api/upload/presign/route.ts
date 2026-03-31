import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { createPresignedUpload } from "@/lib/r2";
import { sql } from "@/lib/db";
import { randomBytes } from "crypto";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/**
 * POST /api/upload/presign
 *
 * Returns a presigned PUT URL for direct upload to R2.
 * Body: { site_id, content_type, filename? }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const { site_id, content_type, filename } = await req.json();

    if (!site_id || !content_type) {
      return NextResponse.json(
        { error: "site_id and content_type are required" },
        { status: 400 }
      );
    }

    const ext = ALLOWED_TYPES[content_type];
    if (!ext) {
      return NextResponse.json(
        { error: `Unsupported file type: ${content_type}. Allowed: ${Object.keys(ALLOWED_TYPES).join(", ")}` },
        { status: 400 }
      );
    }

    // Verify site belongs to this subscriber
    const [site] = await sql`
      SELECT id, name FROM sites
      WHERE id = ${site_id} AND subscriber_id = ${auth.subscriberId}
    `;
    if (!site) {
      return NextResponse.json(
        { error: "Site not found or not owned by subscriber" },
        { status: 404 }
      );
    }

    // Build storage key: sites/{site_id}/{date}/{random}.{ext}
    const date = new Date().toISOString().slice(0, 10);
    const id = randomBytes(8).toString("hex");
    const safeName = filename
      ? filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.[^.]+$/, "").slice(0, 60)
      : id;
    const key = `sites/${site_id}/media/${safeName}-${date.slice(5)}.${ext}`;

    const mediaType = content_type.startsWith("video/") ? "video" : "image";

    const { uploadUrl, publicUrl } = await createPresignedUpload({
      key,
      contentType: content_type,
    });

    return NextResponse.json({
      upload_url: uploadUrl,
      public_url: publicUrl,
      key,
      media_type: mediaType,
      max_size: MAX_FILE_SIZE,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
