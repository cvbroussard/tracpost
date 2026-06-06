/**
 * Per-finding resolution lib. Tier 4 v1 of the Phase 3 review surface.
 *
 * Owners walk findings and take an action per finding: resolve (addressed),
 * waive (explicitly chosen not to act), or defer (come back later). Optional
 * response text captures the owner's explanation — high-value signal for
 * external/inconsistency findings where the prompt asks "what was behind that
 * choice?"
 *
 * Resolutions are tied to (business_id, finding_id). Finding ids are
 * regenerated per consolidation run, so regenerating findings orphans
 * existing resolutions; the UI surfaces a warning before regenerating.
 * Signature-based resolution preservation is deferred to v2.
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
