/**
 * POST /api/ops/brand-identity/transcribe
 *
 * Operator-authed dictation → transcript. Multipart in (file + site_id),
 * transcript out. NO storage side effects. The ops mirror of
 * /api/recordings/transcribe-preview (which is subscriber-authed) — reuses the
 * same Whisper core + site-primed prompt so proper-noun recognition matches.
 *
 * v1: transcript becomes the descriptor's `declared` text. Persisting the audio
 * as a backing asset (the "audio = substrate" half of the design) is a follow-up.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { transcribeBlob } from "@/lib/transcribe";
import {
  buildTranscriptionPromptForSite,
  normalizeTranscriptCase,
} from "@/lib/transcribe-prompt";

const MAX_BLOB_BYTES = 25 * 1024 * 1024; // Whisper's per-file ceiling

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const siteId =
      typeof form.get("site_id") === "string" ? (form.get("site_id") as string) : "";
    const prompt = siteId ? await buildTranscriptionPromptForSite(siteId) : "";

    const result = await transcribeBlob(file, file.type, { prompt });
    // Re-assert canonical casing on known proper nouns. Per the design we do
    // NOT otherwise clean the transcript — raw spoken input is the signal.
    const transcript = siteId
      ? await normalizeTranscriptCase(result.text, siteId)
      : result.text;

    return NextResponse.json({ transcript, provider: result.provider });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
