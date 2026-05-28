import { sql } from "@/lib/db";
import { generateServicePage } from "../../service";
import type { ServiceGenerateResult } from "../../service";

/**
 * Service orchestrator.
 *
 * SCOPE: service pages only. Service pages don't refresh as often as
 * blog articles or chapters — typical cadence is once per service when
 * the service entity is provisioned, then occasional refresh when
 * the project portfolio changes substantially.
 *
 * v2.0 has one strategy: stale-refresh. Picks the service page that
 * hasn't been generated in the longest time (or never).
 *
 * Future strategies: geo-coverage (when service_areas grows, refresh
 * to weave new areas), post-launch (when a service entity is freshly
 * created, generate immediately), portfolio-shift (when N+ new
 * projects relevant to this service have been added since last gen).
 */

export type ServiceStrategyKind = "stale_refresh";

export interface ServiceOrchestrateResult {
  strategy: ServiceStrategyKind;
  reason: string;
  generation: ServiceGenerateResult;
}

const STALE_THRESHOLD_DAYS = 90;

/**
 * Run one SERVICE orchestrator tick.
 *
 * Picks the service page on the site that's most stale (or unwritten)
 * and regenerates it. Throws when no service is stale enough to
 * warrant attention — autopilot should pick a different pool then.
 */
export async function orchestrateService(
  siteId: string,
  opts?: { forceServiceId?: string },
): Promise<ServiceOrchestrateResult> {
  let serviceId: string | null = opts?.forceServiceId || null;

  if (!serviceId) {
    // Pick stalest service: any active service on the site whose
    // updated_at is older than threshold, or never been generated
    // (proxy: empty body / no schema_jsonld in metadata).
    const [row] = await sql`
      SELECT id FROM services_v2
      WHERE business_id = ${siteId}
        AND status = 'active'
        AND (
          updated_at < NOW() - INTERVAL '${sql.unsafe(String(STALE_THRESHOLD_DAYS))} days'
          OR body IS NULL
          OR length(body) < 200
        )
      ORDER BY
        CASE WHEN body IS NULL OR length(body) < 200 THEN 0 ELSE 1 END,
        updated_at ASC
      LIMIT 1
    `;
    if (!row) {
      throw new Error(`No stale service found on site ${siteId}`);
    }
    serviceId = row.id as string;
  }

  const generation = await generateServicePage({ serviceId, status: "active" });
  return {
    strategy: "stale_refresh",
    reason: `Stale-refresh strategy regenerated service ${serviceId}`,
    generation,
  };
}

/** Preview which services are stale enough to refresh. */
export async function previewServiceCandidates(siteId: string): Promise<Array<{
  id: string;
  name: string;
  staleDays: number;
  bodyLength: number;
}>> {
  const rows = await sql`
    SELECT id, name, updated_at, COALESCE(length(body), 0) AS body_length
    FROM services_v2
    WHERE business_id = ${siteId} AND status = 'active'
    ORDER BY updated_at ASC
  `;
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    staleDays: Math.floor((now - new Date(r.updated_at as string).getTime()) / 86400000),
    bodyLength: (r.body_length as number) || 0,
  }));
}
