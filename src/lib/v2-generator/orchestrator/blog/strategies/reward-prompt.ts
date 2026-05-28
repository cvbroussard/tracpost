import { sql } from "@/lib/db";
import type { BlogStrategy } from "../types";
import type { BlogGenerateSpec } from "../../../blog";
import { primaryPillarFromTags, type PillarConfig } from "@/lib/pillars";

/**
 * Reward-prompt blog strategy.
 *
 * Picks one persuasion-angle prompt from sites.brand_dna.signals.reward_prompts
 * and shapes a blog spec around it. The prompt's intent + framingAngle
 * become the article's spine; assetBias hints at which kind of asset
 * works best.
 */
export const rewardPromptStrategy: BlogStrategy = {
  kind: "reward_prompt",
  label: "Reward-prompt (goal-shaped)",

  score(assessment) {
    if (assessment.rewardSignals.prompts.length === 0) return 0;
    return 0.6;
  },

  async build(assessment): Promise<BlogGenerateSpec | null> {
    const prompts = assessment.rewardSignals.prompts;
    if (prompts.length === 0) return null;
    const prompt = prompts[Math.floor(Math.random() * prompts.length)];

    const seedId = assessment.freshAssetIds[0];
    if (!seedId) return null;

    const [seed] = await sql`
      SELECT id, content_tags
      FROM media_assets
      WHERE id = ${seedId} AND business_id = ${assessment.siteId}
    `;
    if (!seed) return null;

    // Pillar derived from seed's tags via site pillar_config
    // (LOCKED 2026-05-09 — pillars not stored on assets).
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
          LIMIT 8
        `
      : await sql`
          SELECT id FROM media_assets
          WHERE business_id = ${assessment.siteId}
            AND id <> ${seedId}
            AND processing_stage = 'analyzed' AND archived_at IS NULL
            AND (media_type ILIKE 'image%' OR media_type = 'video')
          ORDER BY quality_score DESC NULLS LAST, created_at DESC
          LIMIT 8
        `;

    return {
      siteId: assessment.siteId,
      heroAssetId: seedId,
      seedAssetId: seedId,
      bodyAssetIds: bodyCandidates.map((r) => r.id as string),
      topicHint: prompt.framingAngle || prompt.label,
      intent: `${prompt.intent} (Goal: ${prompt.goal}.)`,
      status: "draft",
    };
  },
};
