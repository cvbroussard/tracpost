/**
 * M:N junction binder — wires service_gbp_categories rows by
 * cluster_id intersection.
 *
 * Per [[services-pipeline-doctrine]] (second-pass refinement 2026-06-16):
 * services and categories both flow from upstream intent clusters and
 * tag their outputs with the source cluster_id. This binder reads those
 * tags and computes the M:N graph deterministically — no LLM call.
 *
 * For each service S:
 *   1. Find S's source cluster_id (from PersistedService).
 *   2. Find all coached categories C where C.cluster_ids includes
 *      S's cluster_id.
 *   3. Among those, pick the strongest signal as PRIMARY anchor for
 *      this service: the category with the highest count in the
 *      cluster's observed_category_frequencies.
 *   4. INSERT service_gbp_categories rows — one per matched category,
 *      with is_primary=true on the strongest one, false on the rest.
 *
 * Idempotent: deletes existing rows for the services before inserting.
 * Safe to re-run after a regen.
 */
import "server-only";
import { sql } from "@/lib/db";
import type { CoachedCategory } from "@/lib/competitive-intel/category-coaching";
import type { IntentCluster } from "@/lib/competitive-intel/intent-clustering";
import type { PersistedService } from "./derive";

export interface JunctionBindingResult {
  /** Total service_gbp_categories rows written. */
  bindings: number;
  /** Services that produced no bindings (no coached category shares their cluster). */
  unboundServices: Array<{ id: string; name: string; cluster_id: string }>;
}

export async function bindServicesToCategories(args: {
  siteId: string;
  persistedServices: PersistedService[];
  coachedCategories: CoachedCategory[];
  clusters: IntentCluster[];
}): Promise<JunctionBindingResult> {
  const { siteId, persistedServices, coachedCategories, clusters } = args;

  if (persistedServices.length === 0) {
    return { bindings: 0, unboundServices: [] };
  }

  // Build a per-cluster index of coached categories that serve it.
  // Each entry: { cluster_id → CoachedCategory[] }, with each category
  // carrying the cluster's observed-frequency count so we can pick
  // the strongest anchor.
  const clusterById = new Map(clusters.map((c) => [c.cluster_id, c]));
  const coachedByCluster = new Map<string, Array<{ cat: CoachedCategory; freq: number }>>();
  for (const cat of coachedCategories) {
    const tags = cat.cluster_ids ?? [];
    for (const cid of tags) {
      const cluster = clusterById.get(cid);
      if (!cluster) continue;
      const freqEntry = cluster.observed_category_frequencies.find(
        (f) => f.gcid === cat.gcid,
      );
      const freq = freqEntry?.count ?? 0;
      const list = coachedByCluster.get(cid) ?? [];
      list.push({ cat, freq });
      coachedByCluster.set(cid, list);
    }
  }

  // Sort each cluster's matched categories by freq desc — strongest first.
  for (const list of coachedByCluster.values()) {
    list.sort((a, b) => b.freq - a.freq);
  }

  // Idempotent reset: drop any existing bindings for these services.
  // Using IN list with parameterized array would be cleaner, but neon's
  // tagged-template parser doesn't expand arrays — loop instead.
  for (const svc of persistedServices) {
    await sql`DELETE FROM service_gbp_categories WHERE service_id = ${svc.id}`;
  }

  let bindings = 0;
  const unboundServices: JunctionBindingResult["unboundServices"] = [];

  for (const svc of persistedServices) {
    const matches = coachedByCluster.get(svc.cluster_id) ?? [];
    if (matches.length === 0) {
      unboundServices.push({
        id: svc.id,
        name: svc.name,
        cluster_id: svc.cluster_id,
      });
      continue;
    }

    for (let i = 0; i < matches.length; i++) {
      const { cat } = matches[i];
      const isPrimary = i === 0; // strongest-freq match wins primary
      await sql`
        INSERT INTO service_gbp_categories (service_id, gcid, is_primary)
        VALUES (${svc.id}, ${cat.gcid}, ${isPrimary})
        ON CONFLICT DO NOTHING
      `;
      bindings++;
    }
    void siteId; // siteId is conceptually part of the operation but not needed in the row
  }

  return { bindings, unboundServices };
}
