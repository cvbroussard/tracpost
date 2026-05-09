/**
 * POST /api/recordings — register a new recording row, kick off
 * Whisper transcription async via waitUntil.
 *
 * Body: {
 *   site_id,
 *   storage_url,
 *   mime_type,
 *   source_asset_id?,    // FK media_assets — set for briefing-for-an-asset
 *   speaker_persona_id?, // FK personas — set when speaker is attributed
 *   duration_ms?,
 *   source?,             // briefing | voice_over | testimonial | bed | captured_ambient
 *   metadata?,           // jsonb: device, captured_at, sample_rate, etc.
 *   transcribe?,         // bool — default true; set false to skip async transcription
 *   append_transcript_to_context?, // bool — if true and source_asset_id present,
 *                                   //   appends transcript to media_assets.context_note
 *                                   //   (used by the briefing flow)
 * }
 *
 * Returns the recording row immediately (before transcription completes).
 * Caller polls via GET /api/recordings/:id to check transcript status,
 * or relies on the briefing-flip pipeline to pick up the transcript on
 * its next pass.
 *
 * Used by both the web briefing modal and (future) the mobile app.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { waitUntil } from "@vercel/functions";

const VALID_SOURCES = new Set(["briefing", "voice_over", "testimonial", "bed", "captured_ambient"]);

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
      speaker_persona_id,
      duration_ms,
      source = "briefing",
      metadata = {},
      transcribe: shouldTranscribe = true,
      append_transcript_to_context = source === "briefing" && !!source_asset_id,
    } = body;

    if (!site_id || !storage_url || !mime_type) {
      return NextResponse.json(
        { error: "site_id, storage_url, and mime_type are required" },
        { status: 400 },
      );
    }
    if (!VALID_SOURCES.has(source)) {
      return NextResponse.json(
        { error: `invalid source "${source}". Allowed: ${Array.from(VALID_SOURCES).join(", ")}` },
        { status: 400 },
      );
    }

    // Verify site ownership
    const [site] = await sql`
      SELECT id FROM sites
      WHERE id = ${site_id} AND subscription_id = ${auth.subscriptionId}
    `;
    if (!site) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // If source_asset_id provided, verify it belongs to the same site
    // (defensive — prevents cross-tenant recording attribution).
    if (source_asset_id) {
      const [asset] = await sql`
        SELECT id FROM media_assets
        WHERE id = ${source_asset_id} AND site_id = ${site_id}
      `;
      if (!asset) {
        return NextResponse.json(
          { error: "source_asset_id not found in this site" },
          { status: 400 },
        );
      }
    }

    const [recording] = await sql`
      INSERT INTO recordings (
        site_id, source_asset_id, storage_url, duration_ms,
        mime_type, speaker_persona_id, source, metadata
      )
      VALUES (
        ${site_id}, ${source_asset_id || null}, ${storage_url}, ${duration_ms || null},
        ${mime_type}, ${speaker_persona_id || null}, ${source},
        ${JSON.stringify(metadata)}::jsonb
      )
      RETURNING id, site_id, source_asset_id, storage_url, mime_type,
                duration_ms, source, created_at
    `;

    // Async transcription via waitUntil — caller doesn't block. Whisper
    // typically returns in 1-5 seconds for short voice memos.
    if (shouldTranscribe) {
      waitUntil(
        (async () => {
          try {
            const { transcribe } = await import("@/lib/transcribe");
            const result = await transcribe(storage_url as string);
            // Stash time-anchored segments + language detection into
            // metadata so future surfaces (operator click-to-seek
            // playback, voice-over caption sync, clip extraction from
            // spoken vendor moments) can use them. Captured for ALL
            // sources even though briefing display ignores them — see
            // project_tracpost_audio_capture_floor.md (capture floor).
            const segmentsJson = result.segments && result.segments.length > 0
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
                  duration_ms = COALESCE(duration_ms, ${result.duration ? Math.round(result.duration * 1000) : null}),
                  metadata = COALESCE(metadata, '{}'::jsonb) || ${segmentsJson}::jsonb
              WHERE id = ${recording.id}
            `;
            // If asked, append the transcript to the source asset's
            // context_note. Briefing flow uses this to flow the dictated
            // text directly into the asset's caption.
            if (append_transcript_to_context && source_asset_id && result.text) {
              await sql`
                UPDATE media_assets
                SET context_note = CASE
                  WHEN context_note IS NULL OR context_note = '' THEN ${result.text}
                  ELSE context_note || E'\n\n' || ${result.text}
                END
                WHERE id = ${source_asset_id}
              `;
            }
          } catch (err) {
            console.warn(
              `Transcription failed for recording ${recording.id}:`,
              err instanceof Error ? err.message : err,
            );
            // Non-fatal — recording row exists, transcript stays NULL
            // until manual re-transcribe or next cron pickup.
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
 * GET /api/recordings?source_asset_id=...
 * Lists recordings for an asset. Used by the modal to poll transcript
 * status and by future mobile/operator surfaces to inspect history.
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

  // Both query paths verify ownership via subscription_id join
  const recordings = sourceAssetId
    ? await sql`
        SELECT r.id, r.source_asset_id, r.storage_url, r.mime_type,
               r.duration_ms, r.transcript, r.transcribed_at,
               r.transcribe_provider, r.source, r.created_at
        FROM recordings r
        JOIN sites s ON s.id = r.site_id
        WHERE r.source_asset_id = ${sourceAssetId}
          AND s.subscription_id = ${auth.subscriptionId}
          AND r.archived_at IS NULL
        ORDER BY r.created_at DESC
      `
    : await sql`
        SELECT r.id, r.source_asset_id, r.storage_url, r.mime_type,
               r.duration_ms, r.transcript, r.transcribed_at,
               r.transcribe_provider, r.source, r.created_at
        FROM recordings r
        JOIN sites s ON s.id = r.site_id
        WHERE r.site_id = ${siteId}
          AND s.subscription_id = ${auth.subscriptionId}
          AND r.archived_at IS NULL
        ORDER BY r.created_at DESC
        LIMIT 100
      `;

  return NextResponse.json({ recordings });
}
