import "server-only";
import { sql } from "@/lib/db";

/**
 * Promote an asset onboarded → briefed once it has a substantive brief.
 *
 * The brief is canonical in `recordings` (LOCKED 2026-05-10), so the gate
 * is "a non-archived recording with a transcript ≥ 40 chars" — the
 * readiness-primitive floor. Idempotent and one-directional: the
 * `processing_stage = 'onboarded'` guard means it never fires twice and
 * never downgrades a briefed/analyzed asset. Safe to call from any
 * recording-write path.
 *
 * Relocated here 2026-05-22 from the /api/assets/[id] PATCH route, where
 * it gated on the (now-vestigial) context_note column and only ran when
 * an analyze-field PATCH happened — so it was dead for recording-based
 * briefs. The brief commit IS the recording write; that is where the
 * stage flip belongs.
 */
export async function promoteToBriefedIfReady(
  assetId: string,
  subscriptionId: string,
): Promise<void> {
  await sql`
    UPDATE media_assets
    SET processing_stage = 'briefed',
        triaged_at = COALESCE(triaged_at, NOW()),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'briefed_at', NOW()::text,
          'briefed_by_subscription_id', ${subscriptionId}
        )
    WHERE id = ${assetId}
      AND processing_stage = 'onboarded'
      AND EXISTS (
        SELECT 1 FROM recordings
        WHERE source_asset_id = ${assetId}
          AND archived_at IS NULL
          AND length(trim(COALESCE(transcript, ''))) >= 40
      )
  `;
}
