import "server-only";
import { sql } from "@/lib/db";

/**
 * Director Call inputs gathered for a still→video render. VISUAL ONLY.
 *
 * The director module itself does no DB work — this helper is the
 * single place that assembles its inputs from the database, so both
 * the variant render path and the director inspector run off identical
 * context with no drift.
 *
 * Visual-only scope: the Director writes a camera move, not a story, so
 * the transcript, creator caption, and copywriting voice traits are NOT
 * gathered here — they belong to the audio/narration layer. See
 * project_tracpost_copy_video_bifurcation.
 */
export interface DirectorContext {
  /** Source still URL — Kling's first frame, the Director's vision input. */
  imageUrl: string;
  /** ai_analysis JSON — scene_type, description, detected entities. */
  analysis: Record<string, unknown> | null;
  /** Brand tone string — drives the camera register only. */
  brandTone: string | null;
  /** Camera moves already used for this asset (variety constraint). */
  previousCameraMoves: string[];
}

/**
 * Assemble the Director Call inputs for an asset. Self-contained — one
 * call, just an assetId. Safe to call from the render pipeline and the
 * inspector alike.
 *
 * previousCameraMoves reads the camera moves already used for this asset
 * from sibling variants' audit trail, so the Director can deliberately
 * pick a different one. Because the video templates render sequentially
 * and each persists its brief before the next starts, the Nth call sees
 * the prior N-1 moves.
 */
export async function gatherDirectorContext(
  assetId: string,
): Promise<DirectorContext | null> {
  const [asset] = await sql`
    SELECT ma.storage_url, ma.ai_analysis
    FROM media_assets ma JOIN businesses s ON s.id = ma.business_id
    WHERE ma.id = ${assetId}
  `;
  if (!asset) return null;

  // Brand tone — Phase B gap per [[brand-dna-retirement]]: observed
  // voice.tone fingerprint has no catalog equivalent yet. Will eventually
  // come from public_presence_observation.verbal substrate or a future
  // observed-voice pipeline.
  const tone: string | null = null;

  const moveRows = await sql`
    SELECT DISTINCT render_settings->'director'->>'camera_move' AS move
    FROM asset_variants
    WHERE source_asset_id = ${assetId}
      AND render_settings->'director'->>'camera_move' IS NOT NULL
  `;
  const previousCameraMoves = moveRows
    .map((r) => r.move as string)
    .filter(Boolean);

  return {
    imageUrl: (asset.storage_url as string) || "",
    analysis: (asset.ai_analysis as Record<string, unknown> | null) || null,
    brandTone: tone,
    previousCameraMoves,
  };
}
