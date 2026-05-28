import { sql } from "@/lib/db";
import type { BlogStrategy } from "../types";
import type { BlogGenerateSpec } from "../../../blog";
import { primaryPillarFromTags, type PillarConfig } from "@/lib/pillars";

/**
 * Asset-driven blog strategy.
 *
 * Pick an unused, high-quality asset as the seed. Asset's context_note
 * becomes the topic hint; siblings matching its pillar become body
 * candidates the LLM may place.
 *
 * Workhorse strategy when the asset library has fresh material. Always
 * available if any unused assets exist (floor 0.3).
 */
export const assetDrivenStrategy: BlogStrategy = {
  kind: "asset_driven",
  label: "Asset-driven (capture-first)",

  score(assessment) {
    if (assessment.freshAssetIds.length === 0) return 0;
    const ratio = Math.min(assessment.freshAssetIds.length / 30, 1);
    return 0.3 + ratio * 0.55;
  },

  async build(assessment): Promise<BlogGenerateSpec | null> {
    const seedId = assessment.freshAssetIds[0];
    if (!seedId) return null;

    const [seed] = await sql`
      SELECT id, content_tags
      FROM media_assets
      WHERE id = ${seedId} AND business_id = ${assessment.siteId}
    `;
    if (!seed) return null;

    // Pillar derived from seed's tags (LOCKED 2026-05-09).
    const [pcRow] = await sql`SELECT pillar_config FROM businesses WHERE id = ${assessment.siteId}`;
    const pc = (pcRow?.pillar_config || []) as PillarConfig;
    const pillar = primaryPillarFromTags(
      (seed.content_tags as string[] | null) || null,
      pc,
    );
    const pillarTagIds = pillar
      ? (pc.find((p) => p.id === pillar)?.tags.map((t) => t.id) || [])
      : [];

    const bodyCandidates = pillarTagIds.length > 0
      ? await sql`
          SELECT id FROM media_assets
          WHERE business_id = ${assessment.siteId}
            AND id <> ${seedId}
            AND processing_stage = 'analyzed' AND archived_at IS NULL
            AND (media_type ILIKE 'image%' OR media_type = 'video')
            AND content_tags && ${pillarTagIds}::text[]
          ORDER BY quality_score DESC NULLS LAST, created_at DESC
          LIMIT 10
        `
      : await sql`
          SELECT id FROM media_assets
          WHERE business_id = ${assessment.siteId}
            AND id <> ${seedId}
            AND processing_stage = 'analyzed' AND archived_at IS NULL
            AND (media_type ILIKE 'image%' OR media_type = 'video')
          ORDER BY quality_score DESC NULLS LAST, created_at DESC
          LIMIT 10
        `;

    return {
      siteId: assessment.siteId,
      heroAssetId: seedId,
      seedAssetId: seedId,
      bodyAssetIds: bodyCandidates.map((r) => r.id as string),
      status: "draft",
    };
  },
};
