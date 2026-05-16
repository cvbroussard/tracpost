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
import { runAnalysisForSite, type AnalysisPayload } from "./analysis-assembly";
import { coachCategoriesForSite } from "./category-coaching";

export interface RunCategoryCoachingResult {
  runId: string;
  status: "complete" | "failed";
  cmaAutoTriggered: boolean;
  error?: string;
}

/**
 * Run the full coaching ceremony for a site. Idempotent at the row
 * level — each call inserts a new run.
 */
export async function runCategoryCoachingForSite(siteId: string): Promise<RunCategoryCoachingResult> {
  const [row] = await sql`
    INSERT INTO category_coaching_runs (site_id, status)
    VALUES (${siteId}, 'running')
    RETURNING id
  `;
  const runId = row.id as string;
  let cmaAutoTriggered = false;

  try {
    // β rule: completed CMA with Tier 2 competitorCategories must exist
    const [existingCma] = await sql`
      SELECT id, analysis_data
      FROM competitive_market_analyses
      WHERE site_id = ${siteId} AND status = 'complete'
      ORDER BY generated_at DESC LIMIT 1
    `;

    let needsCma = !existingCma;
    if (existingCma) {
      const payload = existingCma.analysis_data as AnalysisPayload;
      const tier2Count = (payload.competitorCategories || []).length;
      // If CMA exists but predates Tier 2 (or Tier 2 enrichment failed
      // for all competitors), we can't coach against primary-only signal.
      // Force a fresh run rather than degrading silently.
      if (tier2Count === 0) needsCma = true;
    }

    if (needsCma) {
      cmaAutoTriggered = true;
      await sql`
        UPDATE category_coaching_runs
        SET error_message = 'Auto-triggering CMA (β rule)...'
        WHERE id = ${runId}
      `;
      const cmaResult = await runAnalysisForSite(siteId);
      if (cmaResult.status === "failed") {
        throw new Error(`Auto-triggered CMA failed: ${cmaResult.error ?? "unknown"}`);
      }
    }

    // Now CMA is guaranteed present + Tier 2 enriched. Coach.
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

    return { runId, status: "complete", cmaAutoTriggered };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await sql`
      UPDATE category_coaching_runs
      SET status = 'failed', error_message = ${errorMessage}, updated_at = NOW()
      WHERE id = ${runId}
    `;
    return { runId, status: "failed", cmaAutoTriggered, error: errorMessage };
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
    SELECT id, site_id, status, coaching_data, applied
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
  const siteId = run.site_id as string;

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
  await sql`DELETE FROM site_gbp_categories WHERE site_id = ${siteId}`;
  for (const c of toApply) {
    await sql`
      INSERT INTO site_gbp_categories (site_id, gcid, is_primary, chosen_by, chosen_at)
      VALUES (${siteId}, ${c.gcid}, ${c.proposedPrimary}, 'coaching', NOW())
    `;
  }

  // Mark dirty so the existing GBP sync pipeline pushes on next cycle (#118).
  await sql`
    UPDATE sites
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
    WHERE site_id = ${siteId}
    ORDER BY generated_at DESC
    LIMIT 1
  `;
  return row || null;
}
