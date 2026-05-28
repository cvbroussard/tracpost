/**
 * POST /api/recordings — register a new recording row.
 *
 * Three input modes (mutually exclusive on the audio side):
 *
 * 1. Spoken capture (legacy / no preview):
 *    body: { site_id, storage_url, mime_type, source_asset_id?, ... }
 *    - Audio bytes already in R2 (presigned PUT happened on the client)
 *    - Whisper runs async via waitUntil
 *
 * 2. Spoken capture with precomputed transcript:
 *    body: { ...same as 1, precomputed_transcript: "..." }
 *    - Audio bytes in R2 + transcript already obtained via
 *      /api/recordings/transcribe-preview during the staging step
 *    - Server skips Whisper, persists transcript directly
 *
 * 3. Typed capture (accessibility / "Type instead"):
 *    body: { site_id, transcript, source_asset_id?, ... }
 *    - No audio bytes; subscriber typed the narrative
 *    - storage_url + mime_type stay NULL (per migration #108)
 *    - source forced to 'typed_briefing'
 *
 * Per project_tracpost_recording_as_canonical.md (LOCKED 2026-05-10),
 * recordings.transcript is the canonical asset narrative. This endpoint
 * no longer appends to media_assets.context_note — that column is being
 * dropped in the next migration.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { waitUntil } from "@vercel/functions";
import { promoteToBriefedIfReady } from "@/lib/promote-briefed";

const VALID_SOURCES = new Set([
  "briefing",
  "voice_over",
  "testimonial",
  "bed",
  "captured_ambient",
  "typed_briefing",
]);

export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const body = await req.json();
    const {
      site_id,
      storage_url,
      mime_type,
      source_asset_id,
      duration_ms,
      source: explicitSource,
      metadata = {},
      transcribe: shouldTranscribe = true,
      transcript: typedTranscript,
      precomputed_transcript,
    } = body;

    if (!site_id) {
      return NextResponse.json({ error: "site_id is required" }, { status: 400 });
    }

    const isTypedInput = !storage_url && !mime_type && typeof typedTranscript === "string";
    const isPrecomputedSpoken =
      !!storage_url && !!mime_type && typeof precomputed_transcript === "string";
    const isAsyncSpoken = !!storage_url && !!mime_type && !precomputed_transcript;

    if (!isTypedInput && !isPrecomputedSpoken && !isAsyncSpoken) {
      return NextResponse.json(
        {
          error:
            "Provide either (storage_url + mime_type) for a spoken recording or (transcript) for a typed entry.",
        },
        { status: 400 },
      );
    }

    if (isTypedInput && !typedTranscript.trim()) {
      return NextResponse.json(
        { error: "transcript cannot be empty for typed entries" },
        { status: 400 },
      );
    }

    const source = isTypedInput ? "typed_briefing" : explicitSource || "briefing";
    if (!VALID_SOURCES.has(source)) {
      return NextResponse.json(
        { error: `invalid source "${source}". Allowed: ${Array.from(VALID_SOURCES).join(", ")}` },
        { status: 400 },
      );
    }

    const [site] = await sql`
      SELECT id FROM businesses
      WHERE id = ${site_id} AND billing_account_id = ${auth.subscriptionId}
    `;
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    if (source_asset_id) {
      const [asset] = await sql`
        SELECT id FROM media_assets
        WHERE id = ${source_asset_id} AND business_id = ${site_id}
      `;
      if (!asset) {
        return NextResponse.json(
          { error: "source_asset_id not found in this site" },
          { status: 400 },
        );
      }
    }

    const initialTranscript = isTypedInput
      ? typedTranscript.trim()
      : isPrecomputedSpoken
      ? precomputed_transcript.trim()
      : null;
    const transcribedAt = initialTranscript ? new Date() : null;
    const transcribeProvider = isTypedInput
      ? null
      : isPrecomputedSpoken
      ? "openai-whisper-1"
      : null;

    const [recording] = await sql`
      INSERT INTO recordings (
        business_id, source_asset_id, storage_url, duration_ms,
        mime_type, source, metadata,
        transcript, transcribed_at, transcribe_provider
      )
      VALUES (
        ${site_id}, ${source_asset_id || null},
        ${storage_url || null}, ${duration_ms || null},
        ${mime_type || null}, ${source},
        ${JSON.stringify(metadata)}::jsonb,
        ${initialTranscript}, ${transcribedAt}, ${transcribeProvider}
      )
      RETURNING id, business_id, source_asset_id, storage_url, mime_type,
                duration_ms, source, transcript, transcribed_at,
                transcribe_provider, created_at
    `;

    // Promote onboarded → briefed once a substantive brief exists. The
    // helper self-gates on a recording with transcript ≥ 40 chars, so for
    // typed + precomputed-spoken it fires now; for async-spoken the
    // transcript lands later and the waitUntil block below calls it again.
    if (source_asset_id) {
      try {
        await promoteToBriefedIfReady(source_asset_id as string, auth.subscriptionId);
      } catch (err) {
        console.warn(
          `Briefed promotion failed for asset ${source_asset_id}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Async Whisper only for the legacy / no-preview spoken path.
    // Typed and precomputed paths already have a transcript persisted.
    if (isAsyncSpoken && shouldTranscribe) {
      waitUntil(
        (async () => {
          try {
            const { transcribe } = await import("@/lib/transcribe");
            const { buildTranscriptionPromptForSite, normalizeTranscriptCase } = await import("@/lib/transcribe-prompt");
            const prompt = await buildTranscriptionPromptForSite(site_id as string);
            // voice_over + captured_ambient need time-anchored segments
            // for playback sync — force whisper-1 in those cases. All
            // other sources default to gpt-4o-transcribe for better
            // proper-noun recognition.
            const needsSegments = source === "voice_over" || source === "captured_ambient";
            const sttResult = await transcribe(storage_url as string, { prompt, needsSegments });
            // Catalog case normalization — re-asserts canonical casing
            // on known proper nouns regardless of what the STT model
            // produced.
            const result = {
              ...sttResult,
              text: await normalizeTranscriptCase(sttResult.text, site_id as string),
            };
            const segmentsJson =
              result.segments && result.segments.length > 0
                ? JSON.stringify({
                    segments: result.segments,
                    language: result.language,
                  })
                : JSON.stringify({});
            await sql`
              UPDATE recordings
              SET transcript = ${result.text},
                  transcribed_at = NOW(),
                  transcribe_provider = ${result.provider},
                  duration_ms = COALESCE(duration_ms, ${
                    result.duration ? Math.round(result.duration * 1000) : null
                  }),
                  metadata = COALESCE(metadata, '{}'::jsonb) || ${segmentsJson}::jsonb
              WHERE id = ${recording.id}
            `;
            // Transcript just landed — re-check the briefed promotion
            // (covers the async-spoken path, where the transcript was
            // null at insert time).
            if (source_asset_id) {
              await promoteToBriefedIfReady(source_asset_id as string, auth.subscriptionId);
            }
          } catch (err) {
            console.warn(
              `Transcription failed for recording ${recording.id}:`,
              err instanceof Error ? err.message : err,
            );
          }
        })(),
      );
    }

    return NextResponse.json({ recording }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/recordings?source_asset_id=... | ?site_id=...
 * Lists recordings for an asset or site. Used by the modal to display
 * the latest transcript + history, and by future operator surfaces.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const url = new URL(req.url);
  const sourceAssetId = url.searchParams.get("source_asset_id");
  const siteId = url.searchParams.get("site_id");

  if (!sourceAssetId && !siteId) {
    return NextResponse.json(
      { error: "source_asset_id or site_id required" },
      { status: 400 },
    );
  }

  const recordings = sourceAssetId
    ? await sql`
        SELECT r.id, r.source_asset_id, r.storage_url, r.mime_type,
               r.duration_ms, r.transcript, r.transcribed_at,
               r.transcribe_provider, r.source, r.created_at
        FROM recordings r
        JOIN businesses s ON s.id = r.business_id
        WHERE r.source_asset_id = ${sourceAssetId}
          AND s.billing_account_id = ${auth.subscriptionId}
          AND r.archived_at IS NULL
        ORDER BY r.created_at DESC
      `
    : await sql`
        SELECT r.id, r.source_asset_id, r.storage_url, r.mime_type,
               r.duration_ms, r.transcript, r.transcribed_at,
               r.transcribe_provider, r.source, r.created_at
        FROM recordings r
        JOIN businesses s ON s.id = r.business_id
        WHERE r.business_id = ${siteId}
          AND s.billing_account_id = ${auth.subscriptionId}
          AND r.archived_at IS NULL
        ORDER BY r.created_at DESC
        LIMIT 100
      `;

  return NextResponse.json({ recordings });
}
