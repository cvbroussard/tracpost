/**
 * PATCH /api/recordings/:id
 *
 * Subscriber actions on existing recordings. Supports:
 *   - { archived: true }  → soft-archive (sets archived_at = NOW())
 *   - { archived: false } → restore from archive (clears archived_at)
 *   - { transcript, transcribe_provider?, segments?, language? } →
 *     commit a staged re-transcription. Used by the asset modal's
 *     save flow to persist transcripts staged via the preview-only
 *     POST /api/recordings/:id/transcribe endpoint.
 *
 * Used by the Replace Transcript workflow: subscriber records a new
 * transcript; on commit, the prior recording is archived here so it
 * vanishes from canonical reads (getAssetNarrative latest-wins) but
 * the audio bytes stay in R2 for re-derivation. Asset NEVER becomes
 * debriefed — content_tags stay; only the narrative source changes.
 *
 * DELETE not implemented per project_tracpost_deletion_policy.md
 * (soft-archive only). Hard-delete reserved for cancellation+retention
 * sweep.
 */
import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  // Verify ownership via site → subscription
  const [recording] = await sql`
    SELECT r.id FROM recordings r
    JOIN sites s ON s.id = r.site_id
    WHERE r.id = ${id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!recording) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }

  const body = await req.json();

  if (body.archived === true) {
    await sql`UPDATE recordings SET archived_at = NOW() WHERE id = ${id}`;
  } else if (body.archived === false) {
    await sql`UPDATE recordings SET archived_at = NULL WHERE id = ${id}`;
  } else if (typeof body.transcript === "string") {
    // Transcript commit — usually called from the asset modal save
    // after a staged re-transcription preview. We bump transcribed_at
    // because this is a fresh derivation event; transcribe_provider
    // is updated when the caller provides it (caller has the value
    // from the preview response). Segments JSON updated when present
    // (whisper-1 path) so voice-over playback re-syncs.
    const provider = typeof body.transcribe_provider === "string" ? body.transcribe_provider : null;
    const segments = Array.isArray(body.segments) && body.segments.length > 0
      ? body.segments
      : null;
    const language = typeof body.language === "string" ? body.language : null;
    const segmentsJson = segments
      ? JSON.stringify({ segments, language })
      : null;
    await sql`
      UPDATE recordings
      SET transcript = ${body.transcript},
          transcribed_at = NOW(),
          transcribe_provider = COALESCE(${provider}, transcribe_provider),
          metadata = CASE
            WHEN ${segmentsJson}::jsonb IS NULL THEN metadata
            ELSE COALESCE(metadata, '{}'::jsonb) || ${segmentsJson}::jsonb
          END
      WHERE id = ${id}
    `;
  } else {
    return NextResponse.json(
      { error: "Body must include `archived: true|false` or `transcript: string`" },
      { status: 400 },
    );
  }

  const [updated] = await sql`
    SELECT id, source_asset_id, archived_at, transcript, transcribed_at, transcribe_provider
    FROM recordings WHERE id = ${id}
  `;
  return NextResponse.json({ recording: updated });
}
