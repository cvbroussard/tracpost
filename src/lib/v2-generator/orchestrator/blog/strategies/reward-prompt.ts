import { sql } from "@/lib/db";
import type { BlogStrategy } from "../types";
import type { BlogGenerateSpec } from "../../../blog";

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
      SELECT id, content_pillar, content_pillars
      FROM media_assets
      WHERE id = ${seedId} AND site_id = ${assessment.siteId}
    `;
    if (!seed) return null;

    const pillar = (seed.content_pillar as string | null) || null;
    const bodyCandidates = pillar
      ? await sql`
          SELECT id FROM media_assets
          WHERE site_id = ${assessment.siteId}
            AND id <> ${seedId}
            AND triage_status NOT IN ('quarantined','shelved')
            AND status NOT IN ('deleted','failed')
            AND (media_type ILIKE 'image%' OR media_type = 'video')
            AND (content_pillar = ${pillar} OR ${pillar} = ANY(COALESCE(content_pillars, ARRAY[]::text[])))
          ORDER BY quality_score DESC NULLS LAST, created_at DESC
          LIMIT 8
        `
      : await sql`
          SELECT id FROM media_assets
          WHERE site_id = ${assessment.siteId}
            AND id <> ${seedId}
            AND triage_status NOT IN ('quarantined','shelved')
            AND status NOT IN ('deleted','failed')
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
