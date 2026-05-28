/**
 * POST /api/recordings/upload-url
 *
 * Returns a presigned PUT URL for direct audio upload to R2.
 * Mirrors /api/upload/presign for media_assets, audio-specific MIME allow-list.
 *
 * Used by both the web briefing modal (MediaRecorder) and the future
 * mobile app (native audio capture). Both flows POST a JSON body, get
 * back an upload URL, PUT the audio bytes directly to R2, then call
 * /api/recordings to register the row.
 *
 * Body: { site_id, content_type, source_asset_id?, duration_ms? }
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { createPresignedUpload } from "@/lib/r2";
import { sql } from "@/lib/db";
import { randomBytes } from "crypto";

const ALLOWED_AUDIO_TYPES: Record<string, string> = {
  // Web MediaRecorder default on Chromium-based browsers
  "audio/webm": "webm",
  "audio/webm;codecs=opus": "webm",
  // Safari MediaRecorder + iOS native recording
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  // Android native + general
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
};

const MAX_AUDIO_SIZE = 50 * 1024 * 1024; // 50 MB — generous for ~30 min voice memo

export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const { site_id, content_type } = await req.json();

    if (!site_id || !content_type) {
      return NextResponse.json(
        { error: "site_id and content_type are required" },
        { status: 400 },
      );
    }

    // Normalize content type — MediaRecorder often appends codec hints
    // ("audio/webm;codecs=opus") that aren't in our exact match table.
    const baseType = content_type.split(";")[0].trim();
    const ext = ALLOWED_AUDIO_TYPES[content_type] || ALLOWED_AUDIO_TYPES[baseType];
    if (!ext) {
      return NextResponse.json(
        { error: `Unsupported audio type: ${content_type}. Allowed: ${Object.keys(ALLOWED_AUDIO_TYPES).join(", ")}` },
        { status: 400 },
      );
    }

    // Verify site ownership
    const [site] = await sql`
      SELECT id FROM businesses
      WHERE id = ${site_id} AND billing_account_id = ${auth.subscriptionId}
    `;
    if (!site) {
      return NextResponse.json(
        { error: "Site not found or not owned by subscriber" },
        { status: 404 },
      );
    }

    // Build storage key: sites/{site_id}/recordings/{date}/{random}.{ext}
    // Distinct prefix from media_assets so audio is easy to inventory.
    const date = new Date().toISOString().slice(0, 10);
    const id = randomBytes(8).toString("hex");
    const key = `sites/${site_id}/recordings/${date}/${id}.${ext}`;

    const { uploadUrl, publicUrl } = await createPresignedUpload({
      key,
      contentType: baseType,
    });

    return NextResponse.json({
      upload_url: uploadUrl,
      public_url: publicUrl,
      key,
      max_size: MAX_AUDIO_SIZE,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
