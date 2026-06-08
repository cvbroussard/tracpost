/**
 * Per-finding resolution lib. Tier 4 v1 of the Phase 3 review surface.
 *
 * Owners walk findings and take an action per finding: resolve (addressed),
 * waive (explicitly chosen not to act), or defer (come back later). Optional
 * response text captures the owner's explanation — high-value signal for
 * external/inconsistency findings where the prompt asks "what was behind that
 * choice?"
 *
 * Resolutions are tied to (business_id, finding_id). Per
 * [[ppa-cma-recurring-quality-gate]] step 2, finding_ids are now DETERMINISTIC
 * UUIDs derived from `descriptor_key + canonical(observation)`. This means
 * carry-forward across regenerations is AUTOMATIC: when a new findings run
 * lands and surfaces the same finding (same content) again, the deterministic
 * UUID matches the existing resolution row — the resolution stays in effect.
 *
 * The `findings_substrate_id` column stores the substrate row id of the run
 * in which the operator first resolved the finding; it doesn't get updated
 * on subsequent regenerations. Read-side lifecycle helpers join across runs
 * to compute "first seen / resolved in / last seen" state at query time.
 */
import "server-only";
import { randomUUID } from "crypto";
import { sql } from "@/lib/db";

export type FindingResolutionStatus = "resolved" | "waived" | "deferred";

export interface FindingResolution {
  id: string;
  businessId: string;
  findingsSubstrateId: string;
  findingId: string;
  status: FindingResolutionStatus;
  response: string | null;
  resolvedAt: string;
  updatedAt: string;
}

/**
 * Upsert a resolution for one finding. Re-resolving the same (business,
 * finding) updates the existing row. The `findings_substrate_id` lets us
 * tell at query time whether a resolution belongs to the current findings
 * run or a stale one.
 */
export async function upsertFindingResolution(args: {
  businessId: string;
  findingsSubstrateId: string;
  findingId: string;
  status: FindingResolutionStatus;
  response?: string | null;
}): Promise<{ id: string; created: boolean }> {
  const { businessId, findingsSubstrateId, findingId, status, response } = args;
  const id = randomUUID();
  const [row] = await sql`
    INSERT INTO readiness_finding_resolutions
      (id, business_id, findings_substrate_id, finding_id, status, response)
    VALUES (${id}, ${businessId}, ${findingsSubstrateId}, ${findingId}, ${status}, ${response ?? null})
    ON CONFLICT (business_id, finding_id) DO UPDATE
      SET status                = EXCLUDED.status,
          response              = EXCLUDED.response,
          findings_substrate_id = EXCLUDED.findings_substrate_id,
          resolved_at           = CASE
                                    WHEN readiness_finding_resolutions.status <> EXCLUDED.status
                                    THEN now()
                                    ELSE readiness_finding_resolutions.resolved_at
                                  END,
          updated_at            = now()
    RETURNING id, (xmax = 0) AS created
  `;
  return { id: row.id as string, created: Boolean(row.created) };
}

/**
 * Clear a resolution — reopens the finding (returns it to the open state).
 * Used by the "Reopen" action on the UI.
 */
export async function clearFindingResolution(args: {
  businessId: string;
  findingId: string;
}): Promise<{ cleared: boolean }> {
  const { businessId, findingId } = args;
  const r = await sql`
    DELETE FROM readiness_finding_resolutions
    WHERE business_id = ${businessId} AND finding_id = ${findingId}
  `;
  return { cleared: r.length > 0 || (r as { count?: number }).count !== undefined };
}

/**
 * Per-finding lifecycle entry. Computed from joining substrate run history
 * with resolutions on the deterministic finding_id. Feeds the operator-facing
 * "did the catalog work close findings?" view per [[ppa-cma-recurring-quality-gate]].
 */
export interface FindingLifecycle {
  findingId: string;
  /** Run numbers (across all readiness_findings substrate runs) in which this
   *  finding appeared. Ascending. Length > 1 means the finding persisted
   *  across regenerations. A gap means it disappeared in some run and may
   *  have come back (regression). */
  appearedInRuns: number[];
  /** First substrate run that surfaced this finding. */
  firstSeenInRun: number;
  /** Latest substrate run that surfaced this finding. If < the latest overall
   *  run for this brand, the finding CLEARED in a more recent run (success). */
  lastSeenInRun: number;
  /** True if `lastSeenInRun` < the brand's latest readiness_findings run —
   *  i.e., the finding no longer appears in the latest set. */
  clearedInLatestRun: boolean;
  /** True if the finding has a "gap" in its run history — appeared, disappeared,
   *  then came back. Strong signal of regression. */
  regressed: boolean;
  /** Resolution row if the operator ever resolved this finding; null otherwise. */
  resolution: FindingResolution | null;
  /** True if a resolution exists AND the finding has reappeared after it.
   *  Distinct from `regressed` — this is "we thought it was done, but the
   *  diagnostic still surfaces it." Highest-priority signal for operators. */
  resolvedButReappeared: boolean;
}

/**
 * Compute per-finding lifecycle across all readiness_findings substrate runs
 * for a brand. Joins substrate run payloads with resolution rows by the
 * deterministic finding_id. Single round-trip into the DB.
 */
export async function computeFindingLifecycle(
  businessId: string,
): Promise<{ lifecycles: FindingLifecycle[]; latestRunNumber: number | null }> {
  // 1. Fetch all readiness_findings runs (substrate rows) for this brand.
  const runs = await sql`
    SELECT id, run_number, payload, created_at
    FROM business_substrate
    WHERE business_id = ${businessId} AND kind = 'readiness_findings'
    ORDER BY run_number ASC
  `;
  if (runs.length === 0) {
    return { lifecycles: [], latestRunNumber: null };
  }
  const latestRunNumber = Math.max(...runs.map((r) => r.run_number as number));

  // 2. For each finding_id, build its appearance history across runs.
  const appearancesByFinding = new Map<string, number[]>();
  for (const run of runs) {
    const payload = run.payload as { findings?: Array<{ id: string }> };
    const findings = payload?.findings ?? [];
    for (const f of findings) {
      const list = appearancesByFinding.get(f.id) ?? [];
      list.push(run.run_number as number);
      appearancesByFinding.set(f.id, list);
    }
  }

  // 3. Fetch all resolutions for this brand, keyed by finding_id.
  const resolutions = await getFindingResolutions(businessId);

  // 4. Build lifecycle entries.
  const lifecycles: FindingLifecycle[] = [];
  for (const [findingId, runNumbers] of appearancesByFinding.entries()) {
    const sorted = [...runNumbers].sort((a, b) => a - b);
    const firstSeen = sorted[0];
    const lastSeen = sorted[sorted.length - 1];
    const clearedInLatestRun = lastSeen < latestRunNumber;

    // Regression detection: any gap inside the appearance sequence implies
    // the finding cleared at some point and came back. A monotonic sequence
    // (1,2,3) means persistent; (1,3) means cleared in run 2 then resurfaced.
    let regressed = false;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] - sorted[i - 1] > 1) {
        regressed = true;
        break;
      }
    }

    const resolution = resolutions[findingId] ?? null;
    // Resolved-but-reappeared: resolution exists AND a later substrate run
    // still surfaces this finding.
    const resolvedButReappeared = !!resolution &&
      lastSeen > getResolutionRunNumber(resolution, runs);

    lifecycles.push({
      findingId,
      appearedInRuns: sorted,
      firstSeenInRun: firstSeen,
      lastSeenInRun: lastSeen,
      clearedInLatestRun,
      regressed,
      resolution,
      resolvedButReappeared,
    });
  }

  return { lifecycles, latestRunNumber };
}

/** Helper: find the run_number of the substrate row a resolution was stamped
 *  against. Falls back to firstSeen if substrate row isn't found (shouldn't
 *  happen but defensive). */
function getResolutionRunNumber(
  resolution: FindingResolution,
  runs: ReadonlyArray<Record<string, unknown>>,
): number {
  const match = runs.find((r) => r.id === resolution.findingsSubstrateId);
  return (match?.run_number as number) ?? 0;
}

/**
 * Read all resolutions for a business, keyed by finding_id. UI reads this
 * once per page load to render per-finding state in a single round-trip.
 */
export async function getFindingResolutions(
  businessId: string,
): Promise<Record<string, FindingResolution>> {
  const rows = await sql`
    SELECT id, business_id, findings_substrate_id, finding_id,
           status, response, resolved_at, updated_at
    FROM readiness_finding_resolutions
    WHERE business_id = ${businessId}
  `;
  const out: Record<string, FindingResolution> = {};
  for (const r of rows) {
    out[r.finding_id as string] = {
      id: r.id as string,
      businessId: r.business_id as string,
      findingsSubstrateId: r.findings_substrate_id as string,
      findingId: r.finding_id as string,
      status: r.status as FindingResolutionStatus,
      response: (r.response as string | null) ?? null,
      resolvedAt: (r.resolved_at as Date).toISOString(),
      updatedAt: (r.updated_at as Date).toISOString(),
    };
  }
  return out;
}
