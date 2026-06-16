/**
 * Services → category binder. N:1, not M:N.
 *
 * Per [[services-pipeline-doctrine]] (third-pass refinement 2026-06-16):
 * each service points to ONE canonical GBP category — its strongest
 * signal match from the cluster's observed-category frequencies. The
 * earlier M:N model produced over-bound services (a single bathroom
 * service anchored to 6+ categories because incidental matches from
 * competitor co-occurrence slipped through). N:1 forces sharper curation
 * and emits cleaner downstream signal (schema.org serviceType, GBP
 * services field, sitelinks).
 *
 * For each service S:
 *   1. Find S's source cluster_id.
 *   2. From the cluster's observed_category_frequencies, find the
 *      strongest match that ALSO appears in the coached categories
 *      set. (A category outside the coaching plan can't anchor a
 *      service — it won't get applied to GBP.)
 *   3. UPDATE services.primary_gcid to that gcid.
 *
 * If no coached category serves the service's cluster, primary_gcid
 * stays NULL — the service is "unbound" and exists on the website
 * without a GBP category anchor (still renderable, just doesn't
 * benefit from the closed-loop SEO surface).
 */
import "server-only";
import { sql } from "@/lib/db";
import type { CoachedCategory } from "@/lib/competitive-intel/category-coaching";
import type { IntentCluster } from "@/lib/competitive-intel/intent-clustering";
import type { PersistedService } from "./derive";

export interface BindingResult {
  /** Services that were bound to a primary category. */
  bound: Array<{ service_id: string; service_name: string; primary_gcid: string; category_name: string }>;
  /** Services with no coached category in their source cluster — primary_gcid stays NULL. */
  unbound: Array<{ service_id: string; service_name: string; cluster_id: string }>;
}

export async function bindServicesToCategories(args: {
  siteId: string;
  persistedServices: PersistedService[];
  coachedCategories: CoachedCategory[];
  clusters: IntentCluster[];
}): Promise<BindingResult> {
  const { persistedServices, coachedCategories, clusters } = args;

  if (persistedServices.length === 0) {
    return { bound: [], unbound: [] };
  }

  const clusterById = new Map(clusters.map((c) => [c.cluster_id, c]));
  const coachedGcids = new Set(coachedCategories.map((c) => c.gcid));
  const coachedNameByGcid = new Map(coachedCategories.map((c) => [c.gcid, c.name]));

  const bound: BindingResult["bound"] = [];
  const unbound: BindingResult["unbound"] = [];

  for (const svc of persistedServices) {
    const cluster = clusterById.get(svc.cluster_id);
    if (!cluster) {
      unbound.push({
        service_id: svc.id,
        service_name: svc.name,
        cluster_id: svc.cluster_id,
      });
      // Clear any stale binding from a prior run
      await sql`UPDATE services SET primary_gcid = NULL WHERE id = ${svc.id}`;
      continue;
    }

    // Strongest-frequency category in this cluster that's also coached.
    // observed_category_frequencies is already sorted by count desc.
    const winner = cluster.observed_category_frequencies.find((f) =>
      coachedGcids.has(f.gcid),
    );

    if (!winner) {
      unbound.push({
        service_id: svc.id,
        service_name: svc.name,
        cluster_id: svc.cluster_id,
      });
      await sql`UPDATE services SET primary_gcid = NULL WHERE id = ${svc.id}`;
      continue;
    }

    await sql`
      UPDATE services SET primary_gcid = ${winner.gcid} WHERE id = ${svc.id}
    `;
    bound.push({
      service_id: svc.id,
      service_name: svc.name,
      primary_gcid: winner.gcid,
      category_name: coachedNameByGcid.get(winner.gcid) ?? winner.name,
    });
  }

  return { bound, unbound };
}
