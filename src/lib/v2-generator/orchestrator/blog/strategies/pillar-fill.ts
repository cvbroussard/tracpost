import { sql } from "@/lib/db";
import type { BlogStrategy } from "../types";
import type { BlogGenerateSpec } from "../../../blog";

const TARGET_PILLARS = ["what", "who", "how", "craft", "proof", "design"];

/**
 * Pillar-fill blog strategy.
 *
 * Looks at v2 blog article distribution across content pillars. If
 * coverage is uneven, picks the most-underrepresented pillar and
 * builds a spec biased toward filling it.
 */
export const pillarFillStrategy: BlogStrategy = {
  kind: "pillar_fill",
  label: "Pillar-fill (gap-aware)",

  score(assessment) {
    if (assessment.publishedCount < 5) return 0;
    const counts = TARGET_PILLARS.map((p) => assessment.pillarCoverage[p] || 0);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max === 0) return 0;
    const imbalance = (max - min) / max;
    return Math.min(imbalance * 0.9, 0.85);
  },

  async build(assessment): Promise<BlogGenerateSpec | null> {
    const counts = TARGET_PILLARS.map((p) => ({
      pillar: p,
      count: assessment.pillarCoverage[p] || 0,
      recentlyUsed: assessment.recentArticlePillars.includes(p),
    }));
    counts.sort((a, b) => {
      if (a.count !== b.count) return a.count - b.count;
      if (a.recentlyUsed !== b.recentlyUsed) return a.recentlyUsed ? 1 : -1;
      return 0;
    });
    const gap = counts[0]?.pillar;
    if (!gap) return null;

    const usedRows = await sql`
      SELECT DISTINCT id FROM (
        SELECT seed_asset_id AS id FROM blog_posts_v2 WHERE site_id = ${assessment.siteId} AND seed_asset_id IS NOT NULL
        UNION
        SELECT hero_asset_id AS id FROM blog_posts_v2 WHERE site_id = ${assessment.siteId}
      ) u
    `;
    const usedIds = usedRows.map((r) => r.id as string);

    const [seed] = await sql`
      SELECT id FROM media_assets
      WHERE site_id = ${assessment.siteId}
        AND (media_type ILIKE 'image%' OR media_type = 'video')
        AND triage_status NOT IN ('quarantined','shelved')
        AND status NOT IN ('deleted','failed')
        AND (content_pillar = ${gap} OR ${gap} = ANY(COALESCE(content_pillars, ARRAY[]::text[])))
        AND id <> ALL(${usedIds}::uuid[])
      ORDER BY
        CASE WHEN media_type = 'video' THEN 0 ELSE 1 END,
        quality_score DESC NULLS LAST,
        created_at DESC
      LIMIT 1
    `;
    if (!seed) return null;

    const bodyCandidates = await sql`
      SELECT id FROM media_assets
      WHERE site_id = ${assessment.siteId}
        AND id <> ${seed.id}
        AND triage_status NOT IN ('quarantined','shelved')
        AND status NOT IN ('deleted','failed')
        AND (media_type ILIKE 'image%' OR media_type = 'video')
        AND (content_pillar = ${gap} OR ${gap} = ANY(COALESCE(content_pillars, ARRAY[]::text[])))
      ORDER BY quality_score DESC NULLS LAST, created_at DESC
      LIMIT 8
    `;

    return {
      siteId: assessment.siteId,
      heroAssetId: seed.id as string,
      seedAssetId: seed.id as string,
      bodyAssetIds: bodyCandidates.map((r) => r.id as string),
      intent: `Fill the "${gap}" pillar gap — angle the article from this perspective.`,
      status: "draft",
    };
  },
};
