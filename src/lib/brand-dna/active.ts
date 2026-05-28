/**
 * Helper for reading the active brand source for a site.
 *
 * Currently the source of truth is sites.active_brand_source ∈ {'playbook', 'dna'}.
 * Default 'playbook' (existing behavior). When 'dna', returns sites.brand_dna.playbook.
 *
 * Downstream consumers should call this instead of reading sites.brand_playbook
 * directly, so the toggle actually affects content generation.
 *
 * NOTE: Phase B sweep is intentionally deferred — most consumers still read
 * sites.brand_playbook directly during the exploratory stage. This helper
 * exists so we can swap them incrementally as confidence in DNA grows.
 */
import "server-only";
import { sql } from "@/lib/db";

export interface ActiveBrandPlaybook {
  source: "playbook" | "dna";
  playbook: Record<string, unknown> | null;
}

export async function getActiveBrandPlaybook(siteId: string): Promise<ActiveBrandPlaybook> {
  const [row] = await sql`
    SELECT brand_playbook, brand_dna, active_brand_source
    FROM businesses WHERE id = ${siteId}
  `;
  if (!row) return { source: "playbook", playbook: null };

  const source = (row.active_brand_source as "playbook" | "dna") || "playbook";
  if (source === "dna") {
    const dnaEnvelope = row.brand_dna as Record<string, unknown> | null;
    const dnaPlaybook = dnaEnvelope?.playbook as Record<string, unknown> | null;
    if (dnaPlaybook) return { source: "dna", playbook: dnaPlaybook };
    // Fallback to playbook if DNA is somehow missing despite flag
    return { source: "playbook", playbook: row.brand_playbook as Record<string, unknown> | null };
  }
  return { source: "playbook", playbook: row.brand_playbook as Record<string, unknown> | null };
}
