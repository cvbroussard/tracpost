/**
 * Signal Sufficiency Score for brand-DNA augmentation.
 *
 * Computes a 0-1 composite score per site indicating how much historical
 * signal is available and how reliable it is. The score determines which
 * augmentation tier the brand-DNA pipeline should use:
 *
 *   minimal   (0.0–0.3) — category baseline only, no historical shaping
 *   moderate  (0.3–0.7) — voice/tone adjusted; audience stays category-derived
 *   rich      (0.7–1.0) — voice + audience + hooks deeply shaped by signals
 *
 * The score is intentionally cheap to compute (no LLM calls). It gates
 * whether the more expensive extract/generate pipeline runs at all.
 */
import "server-only";
import { sql } from "@/lib/db";

export type Tier = "minimal" | "moderate" | "rich";

export interface SignalScore {
  score: number;
  tier: Tier;
  breakdown: {
    qualityCaptions: { count: number; score: number; weight: number };
    positiveReviews: { count: number; score: number; weight: number };
    gbpProfile: { score: number; weight: number; fieldsPresent: string[] };
    voiceConsistency: { score: number; weight: number; cv: number | null; captionsAnalyzed: number };
  };
}

const WEIGHTS = {
  qualityCaptions: 0.40,
  positiveReviews: 0.25,
  gbpProfile: 0.20,
  voiceConsistency: 0.15,
};

const CAPTION_TARGET = 30;     // count at which qualityCaptions saturates to 1.0
const REVIEW_TARGET = 15;      // count at which positiveReviews saturates to 1.0
const VOICE_MIN_SAMPLES = 5;   // need this many captions to compute coefficient of variation

function tierFromScore(score: number): Tier {
  if (score >= 0.7) return "rich";
  if (score >= 0.3) return "moderate";
  return "minimal";
}

export async function scoreBrandSignals(siteId: string): Promise<SignalScore> {
  // ── 1. Quality captions ──────────────────────────────────────────────
  // historical_posts with caption ≥15 chars, posted within 18mo.
  // Engagement is NOT a filter here — it's a poor proxy for caption quality
  // because platform algorithms shift over time and many platforms (FB pages
  // especially) don't return reliable like/comment counts. Engagement is
  // used downstream for exemplar selection only.
  const captionRows = await sql`
    SELECT caption,
           COALESCE(like_count, 0) + COALESCE(comment_count, 0) AS engagement
    FROM historical_posts
    WHERE site_id = ${siteId}
      AND caption IS NOT NULL
      AND length(caption) >= 15
      AND (posted_at IS NULL OR posted_at >= NOW() - INTERVAL '18 months')
      AND hidden_at IS NULL
  `;
  const captionCount = captionRows.length;
  const captionScore = Math.min(captionCount / CAPTION_TARGET, 1);

  // ── 2. Positive reviews ──────────────────────────────────────────────
  const reviewRows = await sql`
    SELECT COUNT(*)::int AS n
    FROM engagement_events
    WHERE site_id = ${siteId}
      AND platform = 'gbp'
      AND event_type = 'review'
      AND body IS NOT NULL
      AND length(body) >= 30
      AND (metadata->>'star_rating' IN ('FOUR', 'FIVE') OR sentiment = 'positive')
  `;
  const reviewCount = (reviewRows[0]?.n as number) || 0;
  const reviewScore = Math.min(reviewCount / REVIEW_TARGET, 1);

  // ── 3. GBP profile completeness ──────────────────────────────────────
  const [siteRow] = await sql`
    SELECT gbp_profile, business_phone
    FROM sites
    WHERE id = ${siteId}
  `;
  const gbp = (siteRow?.gbp_profile || {}) as Record<string, unknown>;
  const fieldsPresent: string[] = [];
  let gbpRaw = 0;
  // Description ≥80 chars (real description, not just a tagline)
  const desc = gbp.description as string | undefined;
  if (desc && desc.length >= 80) { gbpRaw += 0.4; fieldsPresent.push("description"); }
  // Primary + ≥1 additional category
  const additionalCats = (gbp.additional_categories as string[]) || [];
  if (gbp.primary_category && additionalCats.length >= 1) { gbpRaw += 0.2; fieldsPresent.push("categories"); }
  else if (gbp.primary_category) { gbpRaw += 0.1; fieldsPresent.push("primary_category"); }
  // Regular hours present
  if (gbp.regular_hours) { gbpRaw += 0.2; fieldsPresent.push("hours"); }
  // Phone + website
  if (gbp.primary_phone || siteRow?.business_phone) { gbpRaw += 0.1; fieldsPresent.push("phone"); }
  if (gbp.website_uri) { gbpRaw += 0.1; fieldsPresent.push("website"); }
  const gbpScore = Math.min(gbpRaw, 1);

  // ── 4. Voice consistency (coefficient of variation on caption length) ─
  let voiceScore = 0;
  let cv: number | null = null;
  let captionsAnalyzed = 0;
  if (captionCount >= VOICE_MIN_SAMPLES) {
    const lengths = captionRows.map(r => (r.caption as string).length);
    captionsAnalyzed = lengths.length;
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((acc, l) => acc + (l - mean) ** 2, 0) / lengths.length;
    const stddev = Math.sqrt(variance);
    cv = mean > 0 ? stddev / mean : 0;
    // CV of 0 → perfectly uniform (impossible in practice); 1.0 → highly variable.
    // Score = max(0, 1 - cv) with a floor.
    voiceScore = Math.max(0, Math.min(1, 1 - cv));
  }

  // ── Composite ────────────────────────────────────────────────────────
  const score = Math.min(1,
    captionScore * WEIGHTS.qualityCaptions +
    reviewScore * WEIGHTS.positiveReviews +
    gbpScore * WEIGHTS.gbpProfile +
    voiceScore * WEIGHTS.voiceConsistency
  );

  return {
    score: Math.round(score * 100) / 100,
    tier: tierFromScore(score),
    breakdown: {
      qualityCaptions: { count: captionCount, score: Math.round(captionScore * 100) / 100, weight: WEIGHTS.qualityCaptions },
      positiveReviews: { count: reviewCount, score: Math.round(reviewScore * 100) / 100, weight: WEIGHTS.positiveReviews },
      gbpProfile: { score: Math.round(gbpScore * 100) / 100, weight: WEIGHTS.gbpProfile, fieldsPresent },
      voiceConsistency: { score: Math.round(voiceScore * 100) / 100, weight: WEIGHTS.voiceConsistency, cv: cv === null ? null : Math.round(cv * 100) / 100, captionsAnalyzed },
    },
  };
}
