/**
 * POST /api/recordings/:id/transcribe
 *
 * Re-runs transcription on an existing recording's stored audio.
 * Replaces the transcript field in-place. Used when:
 *   - We've upgraded the STT model (e.g. whisper-1 → gpt-4o-transcribe)
 *     and want to re-derive transcripts for existing recordings without
 *     forcing subscribers to re-record
 *   - The subscriber's catalog has grown (new brands, projects, areas)
 *     so the prompt-priming would yield better proper-noun recognition
 *   - The original transcription had errors and the subscriber wants
 *     a fresh attempt
 *
 * Decouples capture from processing. The same audio file can be
 * transcribed multiple times.
 *
 * Per project_tracpost_recording_as_canonical.md — recordings are
 * the canonical narrative source. Re-transcribing updates the canonical
 * text without rotating the asset's analyze state — the cascade
 * artifact may now be stale, but cascade-commit doesn't re-fire
 * automatically. Subscriber clicks Analyze to refresh.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { transcribe } from "@/lib/transcribe";
import { buildTranscriptionPromptForSite } from "@/lib/transcribe-prompt";

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

    // In-place replacement — overwrite transcript + bump
    // transcribed_at + record provider. Segments JSON updated when
    // present (whisper-1 path) so voice-over playback re-syncs.
    const segmentsJson =
      result.segments && result.segments.length > 0
        ? JSON.stringify({ segments: result.segments, language: result.language })
        : null;

    const [updated] = await sql`
      UPDATE recordings
      SET transcript = ${result.text},
          transcribed_at = NOW(),
          transcribe_provider = ${result.provider},
          metadata = CASE
            WHEN ${segmentsJson}::jsonb IS NULL THEN metadata
            ELSE COALESCE(metadata, '{}'::jsonb) || ${segmentsJson}::jsonb
          END
      WHERE id = ${id}
      RETURNING id, transcript, transcribed_at, transcribe_provider, source_asset_id
    `;

    return NextResponse.json({
      ok: true,
      recording: updated,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
