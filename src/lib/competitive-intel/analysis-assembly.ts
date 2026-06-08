/**
 * Assemble + persist the competitive market analysis for a site.
 *
 * The opening artifact. End-to-end orchestration:
 *   1. Derive target queries from site's GBP categories × service areas
 *   2. Fetch SERPs for each query (Local Pack + organic)
 *   3. Extract ranking competitors (recurring local pack appearances)
 *   4. Fetch each competitor's Places profile (primary type, address,
 *      reviews count, website)
 *   5. Build the comparison artifact: categories diff, review gap,
 *      key recommendations
 *   6. Persist to competitive_market_analyses table
 *
 * Returns the analysis id for downstream display surfaces.
 *
 * Status lifecycle:
 *   pending → running → complete | failed
 */
import { sql } from "@/lib/db";
import { deriveTargetQueries, type TargetQuery } from "./query-derivation";
import {
  fetchSerp,
  fetchCompetitorCategories,
  type SerpResponse,
  type CompetitorCategories,
} from "./serp-fetch";
import {
  extractRankingCompetitors,
  type RankingCompetitor,
  type ExtractionResult,
} from "./competitor-extraction";
import { fetchCompetitorProfile } from "./competitor-profile";
import { generateRecommendations, type Recommendation } from "./recommendations";
import { classifyCompetitors, type ClassifiedTier } from "./tier-classifier";

/**
 * US state abbreviation expansion for SerpAPI location parameter.
 * SerpAPI's location DB uses full names ("Pennsylvania" not "PA").
 */
const STATE_ABBREV_TO_FULL: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia",
};

/**
 * Convert a place name (from GBP service area data) into a SerpAPI-
 * acceptable location string. SerpAPI doesn't accept neighborhood-level
 * locations; we level up to city/state and let the QUERY carry the
 * neighborhood specificity.
 *
 *   "Squirrel Hill, Pittsburgh, PA, USA"     → "Pittsburgh, Pennsylvania, United States"
 *   "Pittsburgh, PA, USA"                    → "Pittsburgh, Pennsylvania, United States"
 *   "Mount Lebanon Township, PA, USA"        → "Mount Lebanon Township, Pennsylvania, United States"
 *   "Pennsylvania, USA"                      → "Pennsylvania, United States"
 *   "Pittsburgh Metropolitan Area, PA, USA"  → "Pittsburgh, Pennsylvania, United States" (best-effort)
 */
export function serpLocationFromPlaceName(placeName: string): string {
  const parts = placeName.split(",").map((p) => p.trim()).filter(Boolean);

  // Strip trailing "USA" if present — we'll add "United States" back
  const hasUsa = parts[parts.length - 1] === "USA";
  if (hasUsa) parts.pop();

  // Expand state abbreviation in penultimate position (if it looks like one)
  if (parts.length >= 2 && parts[parts.length - 1].length === 2) {
    const abbrev = parts[parts.length - 1].toUpperCase();
    if (STATE_ABBREV_TO_FULL[abbrev]) {
      parts[parts.length - 1] = STATE_ABBREV_TO_FULL[abbrev];
    }
  }

  // Drop the first part if there are 3+ remaining (neighborhood prefix)
  // e.g., "Squirrel Hill, Pittsburgh, Pennsylvania" → "Pittsburgh, Pennsylvania"
  if (parts.length >= 3) {
    parts.shift();
  }

  parts.push("United States");
  return parts.join(", ");
}

export interface SubscriberMetrics {
  /** Subscriber's Google Place ID (for context + future exclusion) */
  placeId: string | null;
  /** Live Google rating (1-5) — pulled via Places API at analysis time */
  rating: number | null;
  /** Live review count — pulled via Places API at analysis time */
  reviewCount: number | null;
  /** GBP profile completeness score 0-100 */
  completenessScore: number | null;
  /** Specific fields GBP flagged as missing */
  completenessMissing: string[];
  /** Phone, website, address, social profile presence — yes/no signals */
  hasPhone: boolean;
  hasWebsite: boolean;
  hasAddress: boolean;
  socialProfileCount: number;
  /** Count of declared GBP categories (subscriber's set) */
  categoryCount: number;
  /** Count of declared service areas */
  serviceAreaCount: number;
}

export interface AnalysisPayload {
  /** When the analysis was generated */
  generatedAt: string;
  /** Site's GBP categories at time of analysis (for delta tracking) */
  subscriberCategories: Array<{ gcid: string; name: string; isPrimary: boolean }>;
  /** Site's service areas at time of analysis */
  subscriberServiceAreas: Array<{ placeId: string; placeName: string }>;
  /**
   * Subscriber's declared commercial tier at time of analysis (snapshot).
   * Drives the in-tier vs cross-tier partition in downstream reasoning.
   * Optional because pre-tier-model analyses persisted before this field
   * existed; null/undefined means "no tier filter — render all competitors
   * as equally relevant."
   */
  subscriberTier?: { slug: string; label: string } | null;
  /** Subscriber's own competitive metrics (rating, reviews, completeness, etc.) */
  subscriberMetrics: SubscriberMetrics;
  /** All target queries we ran */
  targetQueries: TargetQuery[];
  /** Top N ranking competitors with merged SERP signal + Places profile */
  topCompetitors: EnrichedCompetitor[];
  /**
   * Tier 2 enrichment — full GBP category list per top competitor.
   * Fetched via SerpAPI google_maps `place` engine. Surfaces the
   * positioning gaps (e.g., "5 of your competitors are tagged
   * Custom home builder, you're not") that Tier 1 primary-only can't.
   * Empty array if Tier 2 enrichment was skipped or failed for all.
   */
  competitorCategories: CompetitorCategories[];
  /** Total distinct businesses observed (for moat data) */
  totalCompetitorsObserved: number;
  /** LLM-generated strategic recommendations (Phase 1E) */
  recommendations?: Recommendation[];
  /** Raw cost telemetry */
  serpQueriesRun: number;
  competitorProfilesFetched: number;
  /** How many Tier 2 google_maps fetches succeeded (cost = N × $0.0075) */
  competitorCategoriesFetched: number;
}

export interface EnrichedCompetitor extends RankingCompetitor {
  // V1: no Places API enrichment because SerpAPI returns Google CID
  // (numeric), not a Places API "ChIJ..." Place ID. SerpAPI's local
  // pack already gives us primary type + rating + reviews + address +
  // website — sufficient for the V1 comparison. V2 may add a
  // CID→PlaceID resolver (via Find Place call with title + address)
  // for additional categories.

  /**
   * Inferred commercial tier — set by tier classifier after Tier 2
   * enrichment. Used by recommendations + coaching to partition
   * topCompetitors into in-tier (subscriber's tier) vs cross-tier
   * (ambient context). Optional because pre-tier-model analyses
   * persisted before this field existed; treat as unclassified.
   */
  inferredTier?: ClassifiedTier;
}

export interface AssemblyResult {
  analysisId: string;
  status: "complete" | "failed";
  payload?: AnalysisPayload;
  error?: string;
}

export interface AssemblyOptions {
  /** Override the default 20-query cap */
  maxQueries?: number;
  /** Override the default top-10 competitor count */
  topN?: number;
}

/**
 * Run the full analysis pipeline for a site.
 *
 * Creates a competitive_market_analyses row at status='running' before
 * fetching anything (idempotency + progress visibility). On success,
 * marks complete with the assembled payload. On failure, marks failed
 * with the error message — keeps the row for diagnostic visibility.
 *
 * Per [[ppa-cma-recurring-quality-gate]]: each run gets a run_number
 * (computed as MAX+1 for this business) and a run_purpose (caller-specified:
 * 'diagnostic' for the first measurement, 'verification' for a re-run after
 * catalog/website work, 'ad_hoc' for operator-triggered exploration). The
 * catalog snapshot timestamp captures "what state of the catalog was this
 * measurement against" — enables the diff/improvement signal between runs.
 */
export async function runAnalysisForSite(
  siteId: string,
  opts: AssemblyOptions & { runPurpose?: "diagnostic" | "verification" | "ad_hoc" } = {},
): Promise<AssemblyResult> {
  const runPurpose = opts.runPurpose ?? "ad_hoc";

  // Snapshot the catalog state at trigger time — most-recent updated_at
  // across the brand's substrate rows. Null if no substrate exists yet.
  const [catalogSnap] = await sql`
    SELECT MAX(updated_at) AS catalog_snapshot_at
    FROM business_substrate
    WHERE business_id = ${siteId}
  `.catch(() => [{ catalog_snapshot_at: null }]);
  const catalogSnapshotAt = (catalogSnap?.catalog_snapshot_at as Date | null) ?? null;

  // Insert a running row up front, computing run_number = MAX+1.
  const [row] = await sql`
    INSERT INTO competitive_market_analyses
      (business_id, status, run_number, run_purpose, catalog_snapshot_at)
    VALUES (
      ${siteId},
      'running',
      COALESCE((SELECT MAX(run_number) FROM competitive_market_analyses WHERE business_id = ${siteId}), 0) + 1,
      ${runPurpose},
      ${catalogSnapshotAt}
    )
    RETURNING id
  `;
  const analysisId = row.id as string;

  try {
    // 1) Derive queries
    const queries = await deriveTargetQueries(siteId, { maxQueries: opts.maxQueries });
    if (queries.length === 0) {
      throw new Error("No queries derived — site needs GBP categories AND service areas before analysis can run");
    }

    // 2) Load subscriber's site context for comparison + competitive metrics
    const [siteRow] = await sql`
      SELECT
        s.gbp_profile,
        s.gbp_profile->'serviceArea'->'places'->'placeInfos' AS place_infos,
        ct.slug AS tier_slug,
        ct.label AS tier_label,
        (SELECT JSON_AGG(JSON_BUILD_OBJECT('gcid', gc.gcid, 'name', gc.name, 'isPrimary', sgc.is_primary))
         FROM business_gbp_categories sgc JOIN gbp_categories gc ON gc.gcid = sgc.gcid
         WHERE sgc.business_id = ${siteId}) AS categories
      FROM businesses s
      LEFT JOIN commercial_tiers ct ON ct.id = s.commercial_tier_id
      WHERE s.id = ${siteId}
    `;
    const subscriberCategories = (siteRow?.categories || []) as AnalysisPayload["subscriberCategories"];
    const subscriberServiceAreas = (siteRow?.place_infos || []) as AnalysisPayload["subscriberServiceAreas"];
    const subscriberTier = siteRow?.tier_slug
      ? { slug: siteRow.tier_slug as string, label: siteRow.tier_label as string }
      : null;
    const profile = (siteRow?.gbp_profile || {}) as Record<string, unknown>;
    const profileMetadata = (profile.metadata || {}) as Record<string, unknown>;
    const profileCompleteness = (profile.completeness || {}) as { score?: number; missing?: string[] };
    const profileAddress = (profile.address || {}) as { addressLines?: string[] };

    // Subscriber's Google Place ID from the synced GBP profile. Real
    // Place ID format (ChIJ...), usable with Places API for live
    // metrics. (SerpAPI's local pack returns CIDs not Place IDs, so
    // can't use this for SERP exclusion directly — exclusion happens
    // by business-name match if needed.)
    const subscriberPlaceId = (profileMetadata.placeId as string) || null;

    // Fetch live Google rating + review count for the subscriber so the
    // LLM can cite REAL numbers in recommendations (preventing the
    // "your N reviews" hallucination from example-as-data interpretation).
    let subscriberRating: number | null = null;
    let subscriberReviewCount: number | null = null;
    if (subscriberPlaceId) {
      try {
        const ownProfile = await fetchCompetitorProfile(subscriberPlaceId);
        subscriberRating = ownProfile.rating;
        subscriberReviewCount = ownProfile.reviewCount;
      } catch (err) {
        console.warn("Failed to fetch subscriber's own GBP metrics:", err instanceof Error ? err.message : err);
      }
    }

    const subscriberMetrics: SubscriberMetrics = {
      placeId: subscriberPlaceId,
      rating: subscriberRating,
      reviewCount: subscriberReviewCount,
      completenessScore: typeof profileCompleteness.score === "number" ? profileCompleteness.score : null,
      completenessMissing: profileCompleteness.missing || [],
      hasPhone: Boolean(profile.phoneNumber),
      hasWebsite: Boolean(profile.websiteUri),
      hasAddress: (profileAddress.addressLines?.length || 0) > 0,
      socialProfileCount: ((profile.socialProfiles as unknown[]) || []).length,
      categoryCount: subscriberCategories.length,
      serviceAreaCount: subscriberServiceAreas.length,
    };

    // 3) Fetch SERPs for all queries
    // Location parameter must be city/state level (SerpAPI rejects
    // neighborhood-level locations). Use a single coarse location for
    // the entire site, derived from the most-specific declared service
    // area via serpLocationFromPlaceName. Query string itself carries
    // any finer-grained geographic targeting (e.g., "Squirrel Hill").
    const primaryPlaceName = (subscriberServiceAreas[0]?.placeName as string) || "";
    const serpLocation = serpLocationFromPlaceName(primaryPlaceName);

    const serps: SerpResponse[] = [];
    let serpQueriesRun = 0;
    for (const q of queries) {
      try {
        const serp = await fetchSerp(q.query, serpLocation);
        serps.push(serp);
        serpQueriesRun++;
      } catch (err) {
        console.warn(`SERP fetch failed for "${q.query}":`, err instanceof Error ? err.message : err);
        // Continue with other queries — one failure shouldn't kill the run
      }
    }

    // 4) Extract ranking competitors from accumulated SERPs.
    // Note: subscriberPlaceId is a real Google Place ID (ChIJ...) while
    // SerpAPI's local pack returns CIDs (numeric). Exclusion-by-PlaceId
    // won't fire today; if the subscriber's own business appears in a
    // SERP result it'll still surface as a "competitor." Mitigation
    // deferred — typically the subscriber's own listing isn't ranking
    // strongly for the same queries the analysis runs, so this rarely
    // matters in practice. Future: CID→PlaceID resolver via Find Place.
    const extraction: ExtractionResult = extractRankingCompetitors(serps, queries, {
      topN: opts.topN ?? 10,
      excludePlaceId: subscriberPlaceId || undefined,
    });

    // 5) V1: no separate Places enrichment (CID ≠ Place ID — see
    // EnrichedCompetitor note). SerpAPI local pack data is sufficient.
    const topCompetitors: EnrichedCompetitor[] = extraction.topCompetitors;

    // 5b) Tier 2 enrichment — full GBP category list per top competitor.
    // SerpAPI google_maps `place` endpoint, fired in parallel for the top
    // N. ~$0.0075 per fetch; for N=10 that's $0.075 added to the run.
    // Surfaces additional-category positioning gaps that Tier 1's
    // primary-only `type` field can't reveal.
    const tier2Results = await Promise.all(
      topCompetitors.map((c) =>
        fetchCompetitorCategories(c.placeId, c.type ?? null).catch((err) => {
          console.warn(`Tier 2 fetch failed for ${c.title}:`, err instanceof Error ? err.message : err);
          return null;
        }),
      ),
    );
    const competitorCategories: CompetitorCategories[] = tier2Results.filter(
      (c): c is CompetitorCategories => c !== null,
    );

    // Seed any newly-discovered gcids into the local catalog so coaching
    // can later FK them when adding to site_gbp_categories. Mirrors the
    // existing INSERT...ON CONFLICT pattern from syncProfileFromGoogle.
    for (const cc of competitorCategories) {
      for (let i = 0; i < cc.gcids.length; i++) {
        await sql`
          INSERT INTO gbp_categories (gcid, name)
          VALUES (${cc.gcids[i]}, ${cc.displayNames[i]})
          ON CONFLICT (gcid) DO NOTHING
        `;
      }
    }

    // 5c) Tier classification — assign each top competitor a commercial
    // tier slug (Haiku, ~$0.001/competitor). Downstream consumers
    // (recommendations + coaching) partition the topCompetitors into
    // in-tier vs cross-tier based on subscriber's declared tier.
    const tier2Map = new Map<string, CompetitorCategories>(
      competitorCategories.map((cc) => [cc.cid, cc]),
    );
    const tierMap = await classifyCompetitors(topCompetitors, tier2Map);
    for (const c of topCompetitors) {
      const t = tierMap.get(c.placeId);
      if (t) c.inferredTier = t;
    }

    // 6) Assemble payload
    const payload: AnalysisPayload = {
      generatedAt: new Date().toISOString(),
      subscriberCategories,
      subscriberServiceAreas,
      subscriberTier,
      subscriberMetrics,
      targetQueries: queries,
      topCompetitors,
      competitorCategories,
      totalCompetitorsObserved: extraction.totalBusinessesObserved,
      serpQueriesRun,
      competitorProfilesFetched: subscriberPlaceId ? 1 : 0, // own profile fetch
      competitorCategoriesFetched: competitorCategories.length,
    };

    // 7) Generate LLM recommendations (Phase 1E). Non-fatal — analysis
    // still persists with empty recommendations if the LLM call fails.
    try {
      payload.recommendations = await generateRecommendations(payload);
    } catch (err) {
      console.warn("Recommendation generation failed:", err instanceof Error ? err.message : err);
      payload.recommendations = [];
    }

    // 8) Persist + mark complete
    await sql`
      UPDATE competitive_market_analyses
      SET status = 'complete', analysis_data = ${JSON.stringify(payload)}::jsonb, updated_at = NOW()
      WHERE id = ${analysisId}
    `;

    return { analysisId, status: "complete", payload };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await sql`
      UPDATE competitive_market_analyses
      SET status = 'failed', error_message = ${errorMessage}, updated_at = NOW()
      WHERE id = ${analysisId}
    `;
    return { analysisId, status: "failed", error: errorMessage };
  }
}

/**
 * Fetch the latest complete analysis for a site.
 * Returns null if no analysis has been completed yet.
 */
export async function getLatestAnalysis(siteId: string): Promise<{
  id: string;
  generatedAt: string;
  payload: AnalysisPayload;
} | null> {
  const [row] = await sql`
    SELECT id, generated_at, analysis_data
    FROM competitive_market_analyses
    WHERE business_id = ${siteId} AND status = 'complete'
    ORDER BY generated_at DESC
    LIMIT 1
  `;
  if (!row) return null;
  return {
    id: row.id as string,
    generatedAt: row.generated_at as string,
    payload: row.analysis_data as AnalysisPayload,
  };
}
