/**
 * Learning engine — Phase 6c of the render pipeline.
 *
 * Tracks engagement per render config, aggregates performance by
 * config dimension (crop × grade × overlay), and generates
 * recommendations for optimizing future renders.
 *
 * Three functions:
 * 1. syncEngagement() — pulls metrics from social_post_analytics
 *    into render_history.engagement
 * 2. aggregatePerformance() — computes per-config-dimension stats
 * 3. recommendConfig() — suggests the best-performing config for
 *    a given platform + business_type
 */
import "server-only";
import { sql } from "@/lib/db";
import type { PlatformKey, GradePreset } from "./types";

// ── 1. Sync engagement data ─────────────────────────────────────

/**
 * Pull engagement metrics from social_post_analytics into
 * render_history.engagement for posts that have been rendered
 * and published. Run nightly or on-demand.
 */
export async function syncEngagement(siteId: string): Promise<number> {
  const updated = await sql`
    UPDATE render_history rh
    SET engagement = (
      SELECT jsonb_build_object(
        'likes', COALESCE(spa.likes, 0),
        'comments', COALESCE(spa.comments, 0),
        'shares', COALESCE(spa.shares, 0),
        'impressions', COALESCE(spa.impressions, 0),
        'saves', COALESCE(spa.saves, 0),
        'engagement_rate', CASE
          WHEN COALESCE(spa.impressions, 0) > 0
          THEN ROUND((COALESCE(spa.likes, 0) + COALESCE(spa.comments, 0) + COALESCE(spa.shares, 0) + COALESCE(spa.saves, 0))::numeric / spa.impressions * 100, 2)
          ELSE 0
        END
      )
      FROM social_post_analytics spa
      WHERE spa.post_id = rh.social_post_id
      ORDER BY spa.recorded_at DESC
      LIMIT 1
    )
    WHERE rh.engagement IS NULL
      AND rh.social_post_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM social_posts sp
        JOIN social_accounts sa ON sp.account_id = sa.id
        JOIN site_social_links ssl ON ssl.social_account_id = sa.id
        WHERE sp.id = rh.social_post_id
          AND ssl.site_id = ${siteId}
          AND sp.status = 'published'
      )
    RETURNING rh.id
  `;

  return updated.length;
}

// ── 2. Aggregate performance ────────────────────────────────────

interface ConfigPerformance {
  platform: string;
  crop: string;
  grade: string;
  hasOverlays: boolean;
  hasWatermark: boolean;
  sampleSize: number;
  avgEngagementRate: number;
  avgLikes: number;
  avgComments: number;
  totalImpressions: number;
}

/**
 * Aggregate engagement performance by config dimensions for a site.
 * Returns configs ranked by average engagement rate.
 */
export async function aggregatePerformance(
  siteId: string,
  platform?: PlatformKey,
): Promise<ConfigPerformance[]> {
  const platformClause = platform ? sql`AND rh.platform = ${platform}` : sql``;

  const results = await sql`
    SELECT
      rh.platform,
      rh.config->>'crop' AS crop,
      rh.config->>'grade' AS grade,
      CASE WHEN jsonb_array_length(COALESCE(rh.config->'textOverlays', '[]'::jsonb)) > 0 THEN true ELSE false END AS has_overlays,
      COALESCE((rh.config->>'watermark')::boolean, false) AS has_watermark,
      COUNT(*)::int AS sample_size,
      ROUND(AVG(COALESCE((rh.engagement->>'engagement_rate')::numeric, 0)), 2) AS avg_engagement_rate,
      ROUND(AVG(COALESCE((rh.engagement->>'likes')::numeric, 0)), 1) AS avg_likes,
      ROUND(AVG(COALESCE((rh.engagement->>'comments')::numeric, 0)), 1) AS avg_comments,
      SUM(COALESCE((rh.engagement->>'impressions')::int, 0))::int AS total_impressions
    FROM render_history rh
    JOIN social_posts sp ON sp.id = rh.social_post_id
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId}
      AND rh.engagement IS NOT NULL
      AND (rh.engagement->>'impressions')::int > 0
      ${platformClause}
    GROUP BY rh.platform, crop, grade, has_overlays, has_watermark
    HAVING COUNT(*) >= 3
    ORDER BY avg_engagement_rate DESC
  `;

  return results.map((r) => ({
    platform: String(r.platform),
    crop: String(r.crop),
    grade: String(r.grade),
    hasOverlays: Boolean(r.has_overlays),
    hasWatermark: Boolean(r.has_watermark),
    sampleSize: r.sample_size as number,
    avgEngagementRate: Number(r.avg_engagement_rate),
    avgLikes: Number(r.avg_likes),
    avgComments: Number(r.avg_comments),
    totalImpressions: r.total_impressions as number,
  }));
}

// ── 3. Recommend config ─────────────────────────────────────────

interface ConfigRecommendation {
  platform: PlatformKey;
  recommendedGrade: GradePreset;
  recommendedOverlays: boolean;
  recommendedWatermark: boolean;
  confidence: "low" | "medium" | "high";
  reasoning: string;
  basedOnSamples: number;
}

/**
 * Generate a config recommendation for a platform based on
 * historical engagement data. Returns null if insufficient data
 * (needs at least 10 published+tracked posts per platform).
 */
export async function recommendConfig(
  siteId: string,
  platform: PlatformKey,
): Promise<ConfigRecommendation | null> {
  const perf = await aggregatePerformance(siteId, platform);

  if (perf.length === 0) return null;

  const totalSamples = perf.reduce((n, p) => n + p.sampleSize, 0);
  if (totalSamples < 10) return null;

  const best = perf[0]; // already sorted by engagement rate

  const confidence = totalSamples >= 50 ? "high" as const
    : totalSamples >= 20 ? "medium" as const
    : "low" as const;

  const parts: string[] = [];
  parts.push(`${best.grade} grade outperforms on ${platform}`);
  if (best.hasOverlays) parts.push("text overlays improve engagement");
  else parts.push("clean images (no overlays) perform better");
  if (best.hasWatermark) parts.push("watermark does not hurt performance");
  parts.push(`based on ${totalSamples} posts, ${best.avgEngagementRate}% avg engagement`);

  return {
    platform,
    recommendedGrade: best.grade as GradePreset,
    recommendedOverlays: best.hasOverlays,
    recommendedWatermark: best.hasWatermark,
    confidence,
    reasoning: parts.join(". ") + ".",
    basedOnSamples: totalSamples,
  };
}

/**
 * Generate recommendations for all connected platforms.
 */
export async function recommendAllConfigs(
  siteId: string,
): Promise<ConfigRecommendation[]> {
  const platforms = await sql`
    SELECT DISTINCT sa.platform
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.status = 'active'
  `;

  const recommendations: ConfigRecommendation[] = [];

  for (const row of platforms) {
    const rec = await recommendConfig(siteId, String(row.platform) as PlatformKey);
    if (rec) recommendations.push(rec);
  }

  return recommendations;
}

// ── Admin API helpers ───────────────────────────────────────────

/**
 * Get a performance summary for the admin dashboard.
 */
export async function getPerformanceSummary(siteId: string): Promise<{
  totalTracked: number;
  avgEngagementRate: number;
  topPlatform: string | null;
  recommendations: ConfigRecommendation[];
}> {
  const [stats] = await sql`
    SELECT
      COUNT(*)::int AS total_tracked,
      ROUND(AVG(COALESCE((rh.engagement->>'engagement_rate')::numeric, 0)), 2) AS avg_rate
    FROM render_history rh
    JOIN social_posts sp ON sp.id = rh.social_post_id
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId}
      AND rh.engagement IS NOT NULL
  `;

  const [topPlat] = await sql`
    SELECT rh.platform,
           ROUND(AVG(COALESCE((rh.engagement->>'engagement_rate')::numeric, 0)), 2) AS rate
    FROM render_history rh
    JOIN social_posts sp ON sp.id = rh.social_post_id
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId}
      AND rh.engagement IS NOT NULL
    GROUP BY rh.platform
    ORDER BY rate DESC
    LIMIT 1
  `;

  const recommendations = await recommendAllConfigs(siteId);

  return {
    totalTracked: (stats?.total_tracked as number) || 0,
    avgEngagementRate: Number(stats?.avg_rate) || 0,
    topPlatform: topPlat?.platform ? String(topPlat.platform) : null,
    recommendations,
  };
}
