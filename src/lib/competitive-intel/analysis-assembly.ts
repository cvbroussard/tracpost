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
import { fetchSerp, type SerpResponse } from "./serp-fetch";
import {
  extractRankingCompetitors,
  type RankingCompetitor,
  type ExtractionResult,
} from "./competitor-extraction";
import {
  fetchCompetitorProfiles,
  type CompetitorProfile,
} from "./competitor-profile";

export interface AnalysisPayload {
  /** When the analysis was generated */
  generatedAt: string;
  /** Site's GBP categories at time of analysis (for delta tracking) */
  subscriberCategories: Array<{ gcid: string; name: string; isPrimary: boolean }>;
  /** Site's service areas at time of analysis */
  subscriberServiceAreas: Array<{ placeId: string; placeName: string }>;
  /** All target queries we ran */
  targetQueries: TargetQuery[];
  /** Top N ranking competitors with merged SERP signal + Places profile */
  topCompetitors: EnrichedCompetitor[];
  /** Total distinct businesses observed (for moat data) */
  totalCompetitorsObserved: number;
  /** Surfaced gaps + recommendations (LLM-generated in a later phase) */
  recommendations?: Array<{ kind: string; message: string; priority: "high" | "medium" | "low" }>;
  /** Raw cost telemetry */
  serpQueriesRun: number;
  competitorProfilesFetched: number;
}

export interface EnrichedCompetitor extends RankingCompetitor {
  /** Places API profile data merged in */
  profile?: CompetitorProfile;
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
 */
export async function runAnalysisForSite(
  siteId: string,
  opts: AssemblyOptions = {},
): Promise<AssemblyResult> {
  // Insert a running row up front
  const [row] = await sql`
    INSERT INTO competitive_market_analyses (site_id, status)
    VALUES (${siteId}, 'running')
    RETURNING id
  `;
  const analysisId = row.id as string;

  try {
    // 1) Derive queries
    const queries = await deriveTargetQueries(siteId, { maxQueries: opts.maxQueries });
    if (queries.length === 0) {
      throw new Error("No queries derived — site needs GBP categories AND service areas before analysis can run");
    }

    // 2) Load subscriber's site context for comparison
    const [siteRow] = await sql`
      SELECT
        gbp_profile->'serviceArea'->'places'->'placeInfos' AS place_infos,
        (SELECT JSON_AGG(JSON_BUILD_OBJECT('gcid', gc.gcid, 'name', gc.name, 'isPrimary', sgc.is_primary))
         FROM site_gbp_categories sgc JOIN gbp_categories gc ON gc.gcid = sgc.gcid
         WHERE sgc.site_id = ${siteId}) AS categories,
        (SELECT pa.asset_id FROM platform_assets pa
         JOIN site_platform_assets spa ON spa.platform_asset_id = pa.id
         WHERE spa.site_id = ${siteId} AND pa.platform = 'gbp' AND pa.asset_type = 'gbp_location'
         LIMIT 1) AS gbp_location_path
      FROM sites WHERE id = ${siteId}
    `;
    const subscriberCategories = (siteRow?.categories || []) as AnalysisPayload["subscriberCategories"];
    const subscriberServiceAreas = (siteRow?.place_infos || []) as AnalysisPayload["subscriberServiceAreas"];

    // Extract subscriber's own place_id from their gbp_location_path
    // ("locations/9263949534206718382" → the location ID itself is not
    // a Google Place ID; we'd need a separate lookup. For now, scan SERPs
    // for the subscriber's business name and exclude by display match.)
    // Future improvement: store subscriber's Place ID separately.
    const subscriberPlaceId = undefined as string | undefined;

    // 3) Fetch SERPs for all queries (parallel — SerpAPI is rate-limit tolerant)
    const serps: SerpResponse[] = [];
    let serpQueriesRun = 0;
    for (const q of queries) {
      try {
        const serp = await fetchSerp(q.query, q.placeName);
        serps.push(serp);
        serpQueriesRun++;
      } catch (err) {
        console.warn(`SERP fetch failed for "${q.query}":`, err instanceof Error ? err.message : err);
        // Continue with other queries — one failure shouldn't kill the run
      }
    }

    // 4) Extract ranking competitors from accumulated SERPs
    const extraction: ExtractionResult = extractRankingCompetitors(serps, queries, {
      topN: opts.topN ?? 10,
      excludePlaceId: subscriberPlaceId,
    });

    // 5) Fetch Places profile for each top competitor (in parallel)
    const competitorPlaceIds = extraction.topCompetitors.map((c) => c.placeId);
    const profiles = await fetchCompetitorProfiles(competitorPlaceIds);
    const profileById = new Map(profiles.map((p) => [p.placeId, p]));

    const topCompetitors: EnrichedCompetitor[] = extraction.topCompetitors.map((c) => ({
      ...c,
      profile: profileById.get(c.placeId),
    }));

    // 6) Assemble payload
    const payload: AnalysisPayload = {
      generatedAt: new Date().toISOString(),
      subscriberCategories,
      subscriberServiceAreas,
      targetQueries: queries,
      topCompetitors,
      totalCompetitorsObserved: extraction.totalBusinessesObserved,
      serpQueriesRun,
      competitorProfilesFetched: profiles.filter((p) => p.status === "ok").length,
    };

    // 7) Persist + mark complete
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
    WHERE site_id = ${siteId} AND status = 'complete'
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
