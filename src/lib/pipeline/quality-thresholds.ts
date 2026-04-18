import { sql } from "@/lib/db";

export interface QualityThresholds {
  /** Bottom 20% boundary — shelve below this */
  p20: number;
  /** Median — publish eligible above this */
  p50: number;
  /** Top 20% boundary — hero class above this */
  p80: number;
  min: number;
  max: number;
  count: number;
  updated_at: string;
}

const ABSOLUTE_DEFAULTS: QualityThresholds = {
  p20: 0.4,
  p50: 0.5,
  p80: 0.7,
  min: 0,
  max: 1,
  count: 0,
  updated_at: "",
};

const MIN_SAMPLE_SIZE = 10;

/**
 * Get site-relative quality thresholds.
 * Falls back to absolute defaults if site has too few assets.
 */
export async function getThresholds(siteId: string): Promise<QualityThresholds> {
  const [site] = await sql`
    SELECT quality_thresholds FROM sites WHERE id = ${siteId}
  `;

  const stored = (site?.quality_thresholds || {}) as Partial<QualityThresholds>;

  if (stored.count && stored.count >= MIN_SAMPLE_SIZE && stored.p20 !== undefined) {
    return { ...ABSOLUTE_DEFAULTS, ...stored } as QualityThresholds;
  }

  return ABSOLUTE_DEFAULTS;
}

/**
 * Recalculate and persist quality thresholds for a site.
 * Call after triage changes the distribution (new assets, re-triage).
 */
export async function recalculateThresholds(siteId: string): Promise<QualityThresholds> {
  const [stats] = await sql`
    SELECT
      COUNT(*)::int AS count,
      PERCENTILE_CONT(0.20) WITHIN GROUP (ORDER BY quality_score) AS p20,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY quality_score) AS p50,
      PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY quality_score) AS p80,
      MIN(quality_score) AS min_score,
      MAX(quality_score) AS max_score
    FROM media_assets
    WHERE site_id = ${siteId}
      AND triage_status IN ('triaged', 'consumed')
      AND quality_score IS NOT NULL
  `;

  if (!stats || stats.count < MIN_SAMPLE_SIZE) {
    return ABSOLUTE_DEFAULTS;
  }

  const thresholds: QualityThresholds = {
    p20: Math.round((stats.p20 || 0) * 100) / 100,
    p50: Math.round((stats.p50 || 0) * 100) / 100,
    p80: Math.round((stats.p80 || 0) * 100) / 100,
    min: Math.round((stats.min_score || 0) * 100) / 100,
    max: Math.round((stats.max_score || 0) * 100) / 100,
    count: stats.count,
    updated_at: new Date().toISOString(),
  };

  await sql`
    UPDATE sites
    SET quality_thresholds = ${JSON.stringify(thresholds)}::jsonb
    WHERE id = ${siteId}
  `;

  return thresholds;
}

/**
 * Semantic threshold accessors.
 * These map business intent to percentile boundaries.
 */
export function shelveBelow(t: QualityThresholds): number {
  return t.p20;
}

export function publishAbove(t: QualityThresholds): number {
  return t.p50;
}

export function heroAbove(t: QualityThresholds): number {
  return t.p80;
}
