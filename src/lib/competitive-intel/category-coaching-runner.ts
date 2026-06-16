/**
 * End-to-end runner for the GBP categories coaching ceremony.
 *
 * Orchestrates:
 *   1. Insert a category_coaching_runs row at status='running'
 *   2. β-rule check: ensure a completed CMA with Tier 2 data exists.
 *      If missing, auto-trigger a CMA and wait for completion before
 *      proceeding. This enforces the coaching-depends-on-CMA contract.
 *   3. Call coachCategoriesForSite to generate the 10-best plan
 *   4. Persist coaching_data to the row, mark complete
 *   5. Failure modes captured in error_message + status='failed'
 *
 * Caller wires this into a /run endpoint with waitUntil — kicks off
 * async work, returns immediately, client polls the GET endpoint.
 */
import { sql } from "@/lib/db";
import type { AnalysisPayload } from "./analysis-assembly";
import { coachCategoriesForSite } from "./category-coaching";

export interface RunCategoryCoachingResult {
  runId: string;
  status: "complete" | "failed";
  /**
   * Vestigial — kept for backward-compat with callers that read this
   * flag. Always false since the manual-before-autopilot doctrine
   * (2026-06-16) removed auto-trigger.
   */
  cmaAutoTriggered: boolean;
  error?: string;
}

/**
 * Run the full coaching ceremony for a site. Idempotent at the row
 * level — each call inserts a new run.
 */
/**
 * Pre-check for the manual-before-autopilot doctrine: does this site
 * have a CMA suitable for downstream pipelines? Returns null if ready,
 * or a structured blocker object explaining what's missing.
 *
 * Both the categories coaching trigger and the services regenerate
 * trigger call this before doing any work, so the UI can render the
 * same "CMA required" blocker rather than failing mid-pipeline with
 * an opaque error.
 */
export interface CmaBlocker {
  code: "no_cma" | "no_tier2";
  message: string;
}

export async function checkCmaReadiness(siteId: string): Promise<CmaBlocker | null> {
  const [existingCma] = await sql`
    SELECT id, analysis_data
    FROM competitive_market_analyses
    WHERE business_id = ${siteId} AND status = 'complete'
    ORDER BY generated_at DESC LIMIT 1
  `;
  if (!existingCma) {
    return {
      code: "no_cma",
      message:
        "No completed Competitive Market Analysis exists for this site. Run a CMA via Competitive Analysis before triggering categories coaching or services regeneration.",
    };
  }
  const payload = existingCma.analysis_data as AnalysisPayload;
  const tier2Count = (payload.competitorCategories || []).length;
  if (tier2Count === 0) {
    return {
      code: "no_tier2",
      message:
        "The most recent CMA predates Tier 2 competitor-category enrichment (or enrichment failed for all competitors). Re-run the CMA via Competitive Analysis to get a Tier-2-complete payload.",
    };
  }
  return null;
}

export async function runCategoryCoachingForSite(siteId: string): Promise<RunCategoryCoachingResult> {
  const [row] = await sql`
    INSERT INTO category_coaching_runs (business_id, status)
    VALUES (${siteId}, 'running')
    RETURNING id
  `;
  const runId = row.id as string;

  try {
    // Manual-before-autopilot: surface a structured blocker if CMA isn't
    // ready, rather than auto-triggering one. Operator must manually
    // run CMA via Competitive Analysis first. Auto-trigger may return
    // later as an explicit autopilot capability — for now we want each
    // step's behavior to be observable in isolation.
    const blocker = await checkCmaReadiness(siteId);
    if (blocker) {
      throw new Error(`cma_required: ${blocker.message}`);
    }

    // CMA is guaranteed present + Tier 2 enriched. Coach.
    const coaching = await coachCategoriesForSite(siteId);

    await sql`
      UPDATE category_coaching_runs
      SET status = 'complete',
          coaching_data = ${JSON.stringify(coaching)}::jsonb,
          source_analysis_id = ${coaching.sourceAnalysisId}::uuid,
          error_message = NULL,
          updated_at = NOW()
      WHERE id = ${runId}
    `;

    return { runId, status: "complete", cmaAutoTriggered: false };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await sql`
      UPDATE category_coaching_runs
      SET status = 'failed', error_message = ${errorMessage}, updated_at = NOW()
      WHERE id = ${runId}
    `;
    return { runId, status: "failed", cmaAutoTriggered: false, error: errorMessage };
  }
}

/**
 * Apply a coaching run to site_gbp_categories. Replaces the site's
 * categories with the coaching plan (excluding any 'drop' actions),
 * marks gbp_sync_dirty=true so the existing push pipeline fires on
 * next sync. Does NOT call pushCategoriesToGoogle directly — sticks
 * with the established dirty-flag-then-sync pattern (#118).
 *
 * Throws if the run isn't in 'complete' status or has no coaching_data.
 */
export async function applyCoachingRun(
  runId: string,
  appliedBy: string,
): Promise<{ applied: number; primaryGcid: string | null }> {
  const [run] = await sql`
    SELECT id, business_id, status, coaching_data, applied
    FROM category_coaching_runs
    WHERE id = ${runId}
  `;
  if (!run) throw new Error(`Coaching run ${runId} not found`);
  if (run.status !== "complete") throw new Error(`Run is ${run.status}, not complete — can't apply`);
  if (run.applied) throw new Error(`Run already applied at ${run.applied_at}`);

  const coachingData = run.coaching_data as {
    categories: Array<{
      gcid: string;
      name: string;
      action: string;
      proposedPrimary: boolean;
    }>;
  };
  const siteId = run.business_id as string;

  // Filter out any 'drop' actions — we apply keeps + adds + promotes only.
  // GBP allows max 10 categories; the coaching engine targets exactly 10
  // already, so this should be a no-op for properly-formed plans.
  const toApply = coachingData.categories.filter((c) => c.action !== "drop").slice(0, 10);
  const primary = toApply.find((c) => c.proposedPrimary);
  const primaryGcid = primary?.gcid || null;

  // Ensure all gcids exist in the catalog (FK requirement). Should be
  // a no-op since Tier 2 enrichment + catalog slice queries already
  // seeded them, but defend in depth.
  for (const c of toApply) {
    await sql`
      INSERT INTO gbp_categories (gcid, name)
      VALUES (${c.gcid}, ${c.name})
      ON CONFLICT (gcid) DO NOTHING
    `;
  }

  // Replace site_gbp_categories with the coaching plan.
  await sql`DELETE FROM business_gbp_categories WHERE business_id = ${siteId}`;
  for (const c of toApply) {
    await sql`
      INSERT INTO business_gbp_categories (business_id, gcid, is_primary, chosen_by, chosen_at)
      VALUES (${siteId}, ${c.gcid}, ${c.proposedPrimary}, 'coaching', NOW())
    `;
  }

  // Mark dirty so the existing GBP sync pipeline pushes on next cycle (#118).
  await sql`
    UPDATE businesses
    SET gbp_sync_dirty = true,
        gbp_dirty_fields = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(gbp_dirty_fields, '{}') || ARRAY['categories'])))
    WHERE id = ${siteId}
  `;

  // Mark the run as applied
  await sql`
    UPDATE category_coaching_runs
    SET applied = true, applied_at = NOW(), applied_by = ${appliedBy}, updated_at = NOW()
    WHERE id = ${runId}
  `;

  return { applied: toApply.length, primaryGcid };
}

/**
 * Fetch the latest coaching run for a site (any status).
 */
export async function getLatestCoachingRun(siteId: string) {
  const [row] = await sql`
    SELECT id, status, generated_at, applied, applied_at, applied_by,
           coaching_data, source_analysis_id, error_message
    FROM category_coaching_runs
    WHERE business_id = ${siteId}
    ORDER BY generated_at DESC
    LIMIT 1
  `;
  return row || null;
}
