/**
 * Identify ranking competitors from accumulated SERP results.
 *
 * Principle: a real competitor is a business that consistently appears
 * across the queries that matter to the subscriber. One appearance is
 * a data point; repeated appearance across multiple distinct queries
 * is a competitor signal.
 *
 * Algorithm:
 *   1. Aggregate every Local Pack appearance across all queried SERPs
 *   2. Group by place_id (the canonical join key)
 *   3. Score each business by a weighted formula:
 *      - Appearance frequency (more queries = more competitive)
 *      - Average position (higher placement = stronger SEO)
 *      - Query weight (primary > additional > geo_expansion)
 *   4. Filter out the subscriber's own business if it appears
 *   5. Return top N ranked competitors
 *
 * Pure logic — operates on SerpResponse[] from serp-fetch. Testable
 * with mock data, no external API dependency.
 */
import type { SerpResponse, LocalPackResult } from "./serp-fetch";
import type { TargetQuery } from "./query-derivation";

export interface RankingCompetitor {
  placeId: string;
  title: string;
  /** Number of distinct queries where this competitor appeared */
  appearanceCount: number;
  /** Average local pack position across appearances (lower = better) */
  averagePosition: number;
  /** Composite score — higher = stronger competitor */
  score: number;
  /** Highest review count seen across SERP captures (rating context) */
  reviewsCount?: number;
  /** Average rating seen across SERP captures */
  rating?: number;
  /** Business type as Google labels it (e.g., "General contractor") */
  type?: string;
  /** Address (first one we observed; addresses don't change query-to-query) */
  address?: string;
  /** Website if surfaced anywhere in SERP results */
  website?: string;
  /** Which target queries this competitor appeared in (for analysis) */
  appearedInQueries: Array<{ query: string; position: number; weight: string }>;
}

export interface ExtractionResult {
  /** Top N competitors, ranked by score */
  topCompetitors: RankingCompetitor[];
  /** All competitors observed (for full-roster analysis) */
  allCompetitors: RankingCompetitor[];
  /** Total distinct businesses observed across all SERPs */
  totalBusinessesObserved: number;
}

export interface ExtractionOptions {
  /** Top N competitors to return in topCompetitors. Default 10. */
  topN?: number;
  /** Subscriber's own place_id — excluded from competitor list */
  excludePlaceId?: string;
  /** Weight applied to query types when scoring */
  queryWeights?: Record<string, number>;
}

const DEFAULT_QUERY_WEIGHTS: Record<string, number> = {
  primary: 1.0,
  additional: 0.6,
  geo_expansion: 0.4,
};

/**
 * Extract ranking competitors from SerpResponse[] + the queries that
 * generated them.
 */
export function extractRankingCompetitors(
  serps: SerpResponse[],
  queries: TargetQuery[],
  opts: ExtractionOptions = {},
): ExtractionResult {
  const topN = opts.topN ?? 10;
  const weights = { ...DEFAULT_QUERY_WEIGHTS, ...(opts.queryWeights || {}) };
  const excludePlaceId = opts.excludePlaceId;

  // Build query lookup: query string → weight class
  // SERPs and queries are joined by the query string they share
  const queryWeightMap = new Map(queries.map((q) => [q.query, q.weight]));

  // Aggregate appearances per place_id
  const byPlaceId = new Map<string, RankingCompetitor>();

  for (const serp of serps) {
    const weightClass = queryWeightMap.get(serp.query) || "additional";
    for (const local of serp.localPack) {
      if (!local.placeId) continue;
      if (excludePlaceId && local.placeId === excludePlaceId) continue;

      const existing = byPlaceId.get(local.placeId);
      if (existing) {
        existing.appearedInQueries.push({
          query: serp.query,
          position: local.position,
          weight: weightClass,
        });
        // Average position is recomputed below from the full list
      } else {
        byPlaceId.set(local.placeId, {
          placeId: local.placeId,
          title: local.title,
          appearanceCount: 0, // set below
          averagePosition: 0, // set below
          score: 0, // set below
          reviewsCount: local.reviewsCount,
          rating: local.rating,
          type: local.type,
          address: local.address,
          website: local.website,
          appearedInQueries: [{
            query: serp.query,
            position: local.position,
            weight: weightClass,
          }],
        });
      }

      // Update aggregate fields with the highest signal we've seen
      // (multiple SERPs may show the same business with slightly
      // different rating/reviews depending on freshness)
      const current = byPlaceId.get(local.placeId)!;
      if (local.reviewsCount && (!current.reviewsCount || local.reviewsCount > current.reviewsCount)) {
        current.reviewsCount = local.reviewsCount;
      }
      if (local.rating && (!current.rating || local.rating > current.rating)) {
        current.rating = local.rating;
      }
      if (local.website && !current.website) {
        current.website = local.website;
      }
    }
  }

  // Compute scores
  for (const comp of byPlaceId.values()) {
    comp.appearanceCount = comp.appearedInQueries.length;
    comp.averagePosition =
      comp.appearedInQueries.reduce((s, q) => s + q.position, 0) / comp.appearanceCount;

    // Score formula (tunable):
    //   sum(weight per appearance) * (4 - avg_position) / total_queries
    // — Weight-summed appearances reward businesses that show up across
    //   high-value queries (primary > additional > geo_expansion)
    // — (4 - avg_position) reverses position so lower position = higher
    //   contribution (capped at 0 if outside top 3)
    // — Divided by total queries normalizes — a 100-query analysis
    //   doesn't inflate scores vs a 10-query analysis
    const weightedAppearances = comp.appearedInQueries.reduce(
      (s, q) => s + (weights[q.weight] ?? 0.5),
      0,
    );
    const positionFactor = Math.max(0, 4 - comp.averagePosition);
    comp.score = (weightedAppearances * positionFactor) / Math.max(1, serps.length);
  }

  const allCompetitors = Array.from(byPlaceId.values()).sort((a, b) => b.score - a.score);
  const topCompetitors = allCompetitors.slice(0, topN);

  return {
    topCompetitors,
    allCompetitors,
    totalBusinessesObserved: byPlaceId.size,
  };
}
