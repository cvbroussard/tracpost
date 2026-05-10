import "server-only";
import { sql } from "@/lib/db";

/**
 * Asset narrative — the canonical text describing a media asset for
 * downstream consumers (orchestrator, copy-gen v2, brand DNA voice
 * extraction, prompt inspector, etc.).
 *
 * Sourced from recordings.transcript (latest by source_asset_id). During
 * the migration window from media_assets.context_note → recordings as
 * canonical, falls back to context_note when no recordings exist for the
 * asset. After migration #108 drops the column, the fallback becomes a
 * no-op and is removed.
 *
 * See project_tracpost_recording_as_canonical.md.
 */

export interface AssetNarrative {
  text: string;
  source: "recording" | "context_note" | "empty";
  recordingId?: string;
}

export async function getAssetNarrative(assetId: string): Promise<AssetNarrative> {
  const [recording] = await sql`
    SELECT id, transcript
    FROM recordings
    WHERE source_asset_id = ${assetId}
      AND transcript IS NOT NULL
      AND transcript <> ''
      AND archived_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (recording?.transcript) {
    return {
      text: recording.transcript as string,
      source: "recording",
      recordingId: recording.id as string,
    };
  }

  const [asset] = await sql`
    SELECT context_note FROM media_assets WHERE id = ${assetId}
  `;
  if (asset?.context_note) {
    return {
      text: asset.context_note as string,
      source: "context_note",
    };
  }

  return { text: "", source: "empty" };
}

/**
 * Batch variant — fetch narratives for many assets in two queries total.
 * Used by readers that iterate asset pools (orchestrator, prompt inspector,
 * brand DNA extractor) so we avoid an N+1.
 *
 * Result map is keyed by assetId; every requested id is present (with
 * source="empty" if neither a recording nor context_note exists).
 */
export async function getAssetNarrativesByIds(
  assetIds: string[],
): Promise<Map<string, AssetNarrative>> {
  const result = new Map<string, AssetNarrative>();
  if (assetIds.length === 0) return result;

  const recordings = await sql`
    SELECT DISTINCT ON (source_asset_id)
      id, source_asset_id, transcript
    FROM recordings
    WHERE source_asset_id = ANY(${assetIds}::uuid[])
      AND transcript IS NOT NULL
      AND transcript <> ''
      AND archived_at IS NULL
    ORDER BY source_asset_id, created_at DESC
  `;

  for (const r of recordings) {
    result.set(r.source_asset_id as string, {
      text: r.transcript as string,
      source: "recording",
      recordingId: r.id as string,
    });
  }

  const missingIds = assetIds.filter((id) => !result.has(id));
  if (missingIds.length > 0) {
    const fallbacks = await sql`
      SELECT id, context_note
      FROM media_assets
      WHERE id = ANY(${missingIds}::uuid[])
        AND context_note IS NOT NULL
        AND context_note <> ''
    `;
    for (const a of fallbacks) {
      result.set(a.id as string, {
        text: a.context_note as string,
        source: "context_note",
      });
    }
  }

  for (const id of assetIds) {
    if (!result.has(id)) {
      result.set(id, { text: "", source: "empty" });
    }
  }

  return result;
}
