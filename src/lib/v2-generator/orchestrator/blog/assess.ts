import { sql } from "@/lib/db";
import type { BlogSiteAssessment } from "./types";

const RECENT_ARTICLE_LOOKBACK = 5;
const FRESH_ASSET_LIMIT = 50;

/**
 * Inspect the site's current state for blog generation.
 *
 * Reads only blog_posts_v2 + media_assets + dna.signals.reward_prompts.
 * Does NOT inspect projects or services — those are scoped to their
 * respective orchestrators.
 */
export async function assessBlogSite(siteId: string): Promise<BlogSiteAssessment> {
  // Pillar coverage from existing v2 blog articles (any status except archived/flagged)
  const pillarRows = await sql`
    SELECT unnest(content_pillars) AS pillar, COUNT(*)::int AS n
    FROM blog_posts_v2
    WHERE site_id = ${siteId}
      AND status NOT IN ('archived', 'flagged')
    GROUP BY pillar
  `;
  const pillarCoverage: Record<string, number> = {};
  for (const r of pillarRows) {
    pillarCoverage[r.pillar as string] = r.n as number;
  }

  // Recent article pillars — for repetition avoidance
  const recentRows = await sql`
    SELECT content_pillars
    FROM blog_posts_v2
    WHERE site_id = ${siteId}
      AND status NOT IN ('archived', 'flagged')
    ORDER BY created_at DESC
    LIMIT ${RECENT_ARTICLE_LOOKBACK}
  `;
  const recentArticlePillars = recentRows
    .map((r) => (Array.isArray(r.content_pillars) && r.content_pillars.length > 0
      ? (r.content_pillars[0] as string)
      : null))
    .filter((p): p is string => p !== null);

  const [count] = await sql`
    SELECT COUNT(*)::int AS n FROM blog_posts_v2 WHERE site_id = ${siteId}
  `;
  const publishedCount = (count?.n as number) || 0;

  // Fresh + high-quality assets, excluding any already used as seed/hero
  const usedRows = await sql`
    SELECT DISTINCT id FROM (
      SELECT seed_asset_id AS id FROM blog_posts_v2 WHERE site_id = ${siteId} AND seed_asset_id IS NOT NULL
      UNION
      SELECT hero_asset_id AS id FROM blog_posts_v2 WHERE site_id = ${siteId}
    ) u
  `;
  const usedIds = new Set(usedRows.map((r) => r.id as string));

  // Include both image and video; prefer video first (per render-format-default)
  const candidateRows = await sql`
    SELECT id
    FROM media_assets
    WHERE site_id = ${siteId}
      AND (media_type ILIKE 'image%' OR media_type = 'video')
      AND triage_status NOT IN ('quarantined', 'shelved')
      AND status NOT IN ('deleted', 'failed')
      AND context_note IS NOT NULL
    ORDER BY
      CASE WHEN media_type = 'video' THEN 0 ELSE 1 END,
      quality_score DESC NULLS LAST,
      created_at DESC
    LIMIT ${FRESH_ASSET_LIMIT * 3}
  `;
  const freshAssetIds = candidateRows
    .map((r) => r.id as string)
    .filter((id) => !usedIds.has(id))
    .slice(0, FRESH_ASSET_LIMIT);

  // Reward prompts from brand_dna
  const [siteRow] = await sql`SELECT brand_dna FROM sites WHERE id = ${siteId}`;
  const dna = (siteRow?.brand_dna || {}) as Record<string, unknown>;
  const signals = (dna.signals as Record<string, unknown> | null) || {};
  const rawPrompts = Array.isArray(signals.reward_prompts) ? signals.reward_prompts : [];
  const prompts = rawPrompts
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .map((p) => ({
      id: String(p.id),
      label: String(p.label),
      goal: String(p.goal || "awareness"),
      intent: String(p.intent),
      framingAngle: String(p.framingAngle || ""),
      assetBias: ["proof", "process", "people", "before_after"].includes(p.assetBias as string)
        ? (p.assetBias as "proof" | "process" | "people" | "before_after")
        : undefined,
    }));

  return {
    siteId,
    pillarCoverage,
    recentArticlePillars,
    publishedCount,
    freshAssetIds,
    rewardSignals: {
      prompts,
      activeGoals: Array.from(new Set(prompts.map((p) => p.goal))),
      seasonality: null,
    },
  };
}
