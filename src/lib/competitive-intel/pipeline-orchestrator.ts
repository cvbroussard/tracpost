/**
 * Infrastructure pipeline orchestrator — single entry point for the
 * cluster-driven category + services derivation.
 *
 * Per [[services-pipeline-doctrine]] (second-pass refinement 2026-06-16)
 * and [[gbp-categories-cma-authority]] (second-pass refinement):
 *
 *   1. CMA Run (assumed already complete — caller must run first)
 *   2. Intent clustering on CMA payload
 *   3. Parallel fan-out:
 *        - category-coaching → 10-best categories (+ cluster_id tagging)
 *        - services derivation → 5-8 brand-voiced services (cluster-tagged)
 *   4. M:N junction binder — wires service_gbp_categories deterministically
 *
 * Returns a summary suitable for a Studio surface review + block-approve.
 * Does NOT auto-apply the coached categories or persist new services
 * unless explicitly requested via `apply: true` — by default the
 * orchestrator generates a draft plan for owner review.
 *
 * Apply mode is the path that mutates `business_gbp_categories`,
 * `services`, and `service_gbp_categories` atomically.
 */
import "server-only";
import { sql } from "@/lib/db";
import type { AnalysisPayload } from "./analysis-assembly";
import { clusterIntents, type IntentCluster } from "./intent-clustering";
import {
  coachCategoriesForSite,
  tagCoachedCategoriesWithClusters,
  type CoachedCategory,
  type CoachingResult,
} from "./category-coaching";
import {
  generateServicesFromClusters,
  type DerivedService,
} from "@/lib/services/derive";
import { getBrandPlaybookFromDescriptor } from "@/lib/brand-identity/playbook-from-descriptor";

/**
 * Plan-only orchestrator output. Apply is a separate step (caller
 * persists category_coaching_runs row → applies via existing
 * applyCoachingRun + persistDerivedServices + bindServicesToCategories).
 * Keeps this entry point pure-read; mutation lives in the apply route.
 */
export interface OrchestratorResult {
  analysisId: string;
  clusters: IntentCluster[];
  coachedCategories: CoachedCategory[];
  coachingResult: CoachingResult;
  derivedServices: DerivedService[];
  generatedAt: string;
}

export async function runInfrastructurePipeline(
  siteId: string,
): Promise<OrchestratorResult> {
  const [cma] = await sql`
    SELECT id, analysis_data
    FROM competitive_market_analyses
    WHERE business_id = ${siteId} AND status = 'complete'
    ORDER BY generated_at DESC LIMIT 1
  `;
  if (!cma) {
    throw new Error(
      `Infrastructure pipeline requires a completed CMA for site ${siteId}. Run CMA first.`,
    );
  }
  const analysisId = cma.id as string;
  const payload = cma.analysis_data as AnalysisPayload;

  // Shared upstream step — both downstream generators consume this.
  const { clusters } = await clusterIntents(payload);
  if (clusters.length === 0) {
    throw new Error(
      `Intent clustering produced no clusters — CMA payload may be too thin (no queries / no competitors).`,
    );
  }

  // Parallel fan-out. Category coaching uses the existing well-tuned
  // path that reads the raw CMA payload; services consume clusters
  // directly. Both run concurrently.
  const [coachingResult, derivedServices] = await Promise.all([
    coachCategoriesForSite(siteId),
    (async () => {
      const [site] = await sql`SELECT business_type FROM businesses WHERE id = ${siteId}`;
      const playbook = await getBrandPlaybookFromDescriptor(siteId);
      return generateServicesFromClusters({
        clusters,
        playbook,
        businessType: (site?.business_type as string) || null,
      });
    })(),
  ]);

  const coachedCategories = tagCoachedCategoriesWithClusters(
    coachingResult.categories,
    clusters,
  );

  return {
    analysisId,
    clusters,
    coachedCategories,
    coachingResult: { ...coachingResult, categories: coachedCategories },
    derivedServices,
    generatedAt: new Date().toISOString(),
  };
}
