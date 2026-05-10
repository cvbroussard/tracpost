/**
 * POST /api/recordings/transcribe-preview
 *
 * Multipart in, transcript out. NO storage side effects (no R2, no DB).
 *
 * Used by the staged-recording flow so subscribers can validate a take
 * before committing it. The audio bytes pass through to Whisper and the
 * returned transcript is shown inline in the modal. If the subscriber
 * commits the asset, the same bytes upload to R2 and a recording row is
 * created with the precomputed transcript (skipping a second Whisper
 * call). If the subscriber discards, neither R2 nor the DB is touched.
 *
 * See project_tracpost_recording_as_canonical.md.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { transcribeBlob } from "@/lib/transcribe";

const MAX_BLOB_BYTES = 25 * 1024 * 1024; // Whisper's per-file ceiling

export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  // Auth context is unused but ensures only signed-in subscribers can hit
  // this endpoint (prevents anonymous Whisper-quota burning).
  void (authResult as AuthContext);

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { error: "Multipart 'file' field is required" },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "Audio is empty" }, { status: 400 });
    }
    if (file.size > MAX_BLOB_BYTES) {
      return NextResponse.json(
        { error: `Audio exceeds ${MAX_BLOB_BYTES} bytes` },
        { status: 413 },
      );
    }

    const result = await transcribeBlob(file, file.type);
    return NextResponse.json({
      transcript: result.text,
      segments: result.segments || [],
      duration: result.duration ?? null,
      language: result.language ?? null,
      provider: result.provider,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
