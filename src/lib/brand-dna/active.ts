/**
 * Helper for reading the brand playbook for a site.
 *
 * Returns brand_dna.playbook (the canonical playbook source per the 2026-05-06
 * decision in [[brand-dna-roadmap]] and the Phase A retirement in
 * [[brand-playbook-retirement]] LOCKED 2026-06-07). The legacy brand_playbook
 * column has been tripwire-renamed to brand_playbook_legacy and is no longer
 * read by any code path. The active_brand_source flag is now dead — also
 * scheduled for drop after the watch window.
 *
 * Downstream consumers should keep calling this helper rather than reading
 * brand_dna.playbook directly — it's the single read point for the playbook
 * structure, which keeps Phase B ([[brand-dna-retirement]]) sweep small when
 * brand_dna itself retires in favor of brand_descriptor.
 */
import "server-only";
import { sql } from "@/lib/db";

export interface ActiveBrandPlaybook {
  /** Always "dna" post-Phase-A. Kept on the return shape so existing callers don't break. */
  source: "dna";
  playbook: Record<string, unknown> | null;
}

export async function getActiveBrandPlaybook(siteId: string): Promise<ActiveBrandPlaybook> {
  const [row] = await sql`
    SELECT brand_dna
    FROM businesses WHERE id = ${siteId}
  `;
  if (!row) return { source: "dna", playbook: null };

  const dnaEnvelope = row.brand_dna as Record<string, unknown> | null;
  const dnaPlaybook = (dnaEnvelope?.playbook as Record<string, unknown> | null) ?? null;
  return { source: "dna", playbook: dnaPlaybook };
}
