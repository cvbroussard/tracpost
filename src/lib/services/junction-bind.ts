/**
 * Services → category binder. Two-layer model: N:1 primary + cluster set.
 *
 * Per [[stable-service-identity]] (LOAD-BEARING 2026-06-16):
 *   - primary_gcid:     N:1 canonical anchor (single category, for
 *                       surfaces needing one: schema.org serviceType,
 *                       single-anchor analytics, ad sitelinks)
 *   - associated_gcids: the cluster's curated category set (for
 *                       surfaces benefiting from breadth: GBP services
 *                       push, cross-category ad campaigns, related-
 *                       services matching)
 *
 * Both fields populated by the binder from the cluster's curated
 * candidates (passed majority-floor OR top-3 threshold during
 * clustering AND coached for this site). This is NOT a return to the
 * over-binding M:N model the doctrine rejected — primary stays N:1
 * (semantic-aligned), and associated_gcids[] is the SAME curated
 * candidate set, persisted instead of discarded.
 *
 * For each service S:
 *   1. Find S's source cluster_id.
 *   2. From the cluster's observed_category_frequencies, filter to
 *      categories ALSO in the coached set.
 *   3. Sort by semantic alignment to cluster intent (primary key) +
 *      frequency (tie-breaker). Winner = primary_gcid.
 *   4. Entire surviving candidate list = associated_gcids[].
 *   5. UPDATE services SET primary_gcid + associated_gcids.
 *
 * If no coached category serves the service's cluster, both fields
 * are cleared — service is "unbound" and exists on the website
 * without a GBP category anchor.
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
  bound: Array<{
    service_id: string;
    service_name: string;
    primary_gcid: string;
    category_name: string;
    associated_gcids: string[];
  }>;
  /** Services with no coached category in their source cluster. */
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
      await sql`UPDATE services SET primary_gcid = NULL, associated_gcids = '{}' WHERE id = ${svc.id}`;
      continue;
    }

    // Filter cluster's observed categories to coached set + score by
    // semantic alignment first, then frequency.
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
      await sql`UPDATE services SET primary_gcid = NULL, associated_gcids = '{}' WHERE id = ${svc.id}`;
      continue;
    }

    // primary = top-scored; associated = entire surviving candidate
    // set (the cluster's curated category breadth).
    const associated = candidates.map((c) => c.gcid);

    await sql`
      UPDATE services
      SET primary_gcid = ${winner.gcid},
          associated_gcids = ${associated}
      WHERE id = ${svc.id}
    `;
    bound.push({
      service_id: svc.id,
      service_name: svc.name,
      primary_gcid: winner.gcid,
      category_name: coachedNameByGcid.get(winner.gcid) ?? winner.name,
      associated_gcids: associated,
    });
  }

  return { bound, unbound };
}
