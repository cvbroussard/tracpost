/**
 * DEPRECATED — Phase B retirement of brand_dna (LOCKED 2026-06-07,
 * see [[brand-dna-retirement]]).
 *
 * This helper is a temporary shim. New callers MUST call
 * getBrandPlaybookFromDescriptor() from @/lib/brand-identity/playbook-from-descriptor
 * directly. Existing callers (if any remain after the Phase B sweep) get
 * back the synthesized playbook here.
 *
 * The lib/brand-dna/ directory retires entirely once nothing imports it.
 */
import "server-only";
import { getBrandPlaybookFromDescriptor } from "@/lib/brand-identity/playbook-from-descriptor";

export interface ActiveBrandPlaybook {
  source: "dna";
  playbook: Record<string, unknown> | null;
}

export async function getActiveBrandPlaybook(siteId: string): Promise<ActiveBrandPlaybook> {
  const playbook = await getBrandPlaybookFromDescriptor(siteId);
  return {
    source: "dna",
    playbook: (playbook as unknown as Record<string, unknown>) ?? null,
  };
}
