/**
 * POST /api/recordings/:id/transcribe
 *
 * Re-runs transcription on an existing recording's stored audio.
 * PREVIEW ONLY (2026-05-18) — returns the derived transcript text +
 * provider WITHOUT writing to the database. The subscriber's modal
 * stages the result and commits via the asset Save action (which
 * PATCHes /api/recordings/:id with the transcript field). This keeps
 * the form's dirty-state semantics intact and lets the subscriber
 * Revert before committing.
 *
 * Used when:
 *   - We've upgraded the STT model (e.g. whisper-1 → gpt-4o-transcribe)
 *     and want to re-derive transcripts for existing recordings without
 *     forcing subscribers to re-record
 *   - The subscriber's catalog has grown (new brands, projects, areas)
 *     so the prompt-priming would yield better proper-noun recognition
 *   - The original transcription had errors and the subscriber wants
 *     a fresh attempt
 *
 * Decouples capture from processing. The same audio file can be
 * transcribed multiple times without auto-persisting.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { transcribe } from "@/lib/transcribe";
import { buildTranscriptionPromptForSite, normalizeTranscriptCase } from "@/lib/transcribe-prompt";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  // Load the recording; verify it belongs to the caller's subscription
  // and has stored audio (typed recordings have no storage_url).
  const [rec] = await sql`
    SELECT r.id, r.site_id, r.storage_url, r.source
    FROM recordings r
    JOIN sites s ON s.id = r.site_id
    WHERE r.id = ${id}
      AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!rec) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }
  if (!rec.storage_url) {
    return NextResponse.json(
      { error: "Recording has no stored audio (typed input — re-transcribe not applicable)" },
      { status: 400 },
    );
  }

  try {
    // voice_over + captured_ambient need time-anchored segments for
    // playback sync — force whisper-1 in those cases. All other
    // sources use gpt-4o-transcribe (default) for stronger proper-
    // noun recognition.
    const needsSegments = rec.source === "voice_over" || rec.source === "captured_ambient";
    const prompt = await buildTranscriptionPromptForSite(rec.site_id as string);
    const result = await transcribe(rec.storage_url as string, { prompt, needsSegments });
    // Catalog case normalization — re-asserts canonical casing on
    // known proper nouns regardless of what the STT model produced.
    const normalizedText = await normalizeTranscriptCase(result.text, rec.site_id as string);

    // Preview only — return the new text + provider + segments
    // without writing. Caller (asset modal) stages this in client
    // state and commits via PATCH /api/recordings/[id] when the
    // subscriber saves the asset.
    return NextResponse.json({
      ok: true,
      preview: {
        id,
        transcript: normalizedText,
        transcribe_provider: result.provider,
        segments: result.segments || [],
        language: result.language ?? null,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
