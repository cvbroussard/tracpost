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

/**
 * Strip a small set of common English suffixes so token comparison
 * matches "remodeler"/"remodeling", "builder"/"building", etc. without
 * needing a real stemmer. Conservative — only trims the obvious ones.
 */
function stemToken(t: string): string {
  if (t.length <= 4) return t;
  for (const suffix of ["ing", "er", "or", "ers", "ors", "ion"]) {
    if (t.endsWith(suffix) && t.length - suffix.length >= 3) {
      return t.slice(0, t.length - suffix.length);
    }
  }
  return t;
}

function tokenize(s: string): Set<string> {
  const stop = new Set(["and", "the", "for", "with", "from", "into", "your", "you", "are", "our", "all"]);
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !stop.has(t))
      .map(stemToken),
  );
}

/**
 * Semantic alignment score between a category name and a cluster's
 * intent label. Token overlap with light stemming.
 *
 * Used as the PRIMARY sort key in the N:1 binder so the cluster's
 * intent ("Custom home building") drives anchor selection toward
 * the matching category ("Custom home builder") rather than whichever
 * category happens to have the highest observed frequency across
 * competitor declarations (which tends to crown broad-coverage
 * categories like "Remodeler" that share none of the cluster's
 * semantic content).
 */
function semanticMatchScore(categoryName: string, intentLabel: string): number {
  const catTokens = tokenize(categoryName);
  const intentTokens = tokenize(intentLabel);
  let overlap = 0;
  for (const t of catTokens) {
    if (intentTokens.has(t)) overlap++;
  }
  return overlap;
}

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

    // Pick the anchor by SEMANTIC ALIGNMENT first, then frequency as
    // tie-breaker. Frequency alone was wrong — bathroom remodelers
    // share categories with broader remodelers, so "Remodeler" wins
    // raw frequency even in clusters whose intent points elsewhere
    // (e.g. "Custom home building" cluster anchored to Remodeler
    // instead of Custom home builder). The semantic score levels this.
    const candidates = cluster.observed_category_frequencies
      .filter((f) => coachedGcids.has(f.gcid))
      .map((f) => ({
        ...f,
        semantic: semanticMatchScore(f.name, cluster.intent_label),
      }))
      .sort((a, b) => {
        if (b.semantic !== a.semantic) return b.semantic - a.semantic;
        return b.count - a.count;
      });
    const winner = candidates[0];

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
