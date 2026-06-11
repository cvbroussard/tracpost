import "server-only";
import { sql } from "@/lib/db";
import { upsertSubstrate } from "@/lib/substrate/store";
import {
  BRAND_DESCRIPTOR_CATALOG,
  type BrandDomain,
} from "@/lib/brand-identity/catalog";

/**
 * Brand identity catalog snapshot — the canonical work of provisioning
 * step 12 (`brand_identity_complete`).
 *
 * Per [[brand-identity-layer-stack]]: BRAND IDENTITY → SURFACE
 * IMPLEMENTATIONS → RENDERED ASSETS. The transition between the (mutable,
 * owner-editable) catalog and the (canonical, surface-translating-from)
 * snapshot happens here. Surfaces that previously read from
 * `brand_descriptor.declared` directly should — per
 * [[website-generator-brand-identity-overhaul]] — eventually consume
 * from this snapshot instead.
 *
 * Per [[provisioning-scope]]: this snapshot IS the deliverable handoff
 * point from the brand-identity pipeline to the orchestrator. Until the
 * snapshot exists, brand identity is WIP.
 *
 * Append pattern ([[ppa-cma-recurring-quality-gate]]): each seal is a NEW
 * row with incremented run_number. History is the brand-evolution audit
 * trail. The owner can re-seal after refining the catalog; old snapshots
 * remain readable so the agency can compare brand-version-N vs N-1.
 *
 * Required: all 4 domains (strategic/verbal/visual/sonic) must be
 * "complete" in the recompute view before sealing is permitted. The
 * permission check lives in `canSeal()` below; callers must respect it.
 */

const SNAPSHOT_VERSION = "1.0.0";

export interface SnapshotDescriptor {
  key: string;
  domain: BrandDomain;
  declared: unknown;
  metadata: Record<string, unknown> | null;
  status: string | null;
  /** True when descriptor.declared is non-empty AT seal time. */
  satisfied: boolean;
}

export interface SnapshotPayload {
  descriptors: SnapshotDescriptor[];
  meta: {
    snapshot_version: string;
    sealed_at: string;
    descriptor_count: number;
    /** All 4 domains' completion ratios captured at seal time. */
    domain_completion: Record<BrandDomain, { declared: number; total: number }>;
    /** brand_identity row id this snapshot was captured against. */
    brand_identity_id: string;
  };
}

export interface SealResult {
  persisted: boolean;
  reason?: string;
  substrateId?: string;
  runNumber?: number;
  descriptorCount?: number;
}

/**
 * Catalog descriptors for v1.0-rc are the truth source of WHAT to capture.
 * This function reads them + the per-business declared values, producing
 * the snapshot payload. Designed as data, not the write call — so the
 * recompute layer can preview "what would a seal capture right now"
 * without performing the write.
 */
export async function buildSnapshotPayload(args: {
  businessId: string;
  brandIdentityId: string;
}): Promise<SnapshotPayload> {
  const { businessId, brandIdentityId } = args;
  const rows = await sql`
    SELECT key, declared, metadata, status
    FROM brand_descriptor
    WHERE brand_identity_id = ${brandIdentityId}
  `;
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) byKey.set(r.key as string, r);

  const descriptors: SnapshotDescriptor[] = [];
  const domainCompletion: Record<BrandDomain, { declared: number; total: number }> = {
    strategic: { declared: 0, total: 0 },
    verbal: { declared: 0, total: 0 },
    visual: { declared: 0, total: 0 },
    sonic: { declared: 0, total: 0 },
  };

  for (const spec of BRAND_DESCRIPTOR_CATALOG) {
    const row = byKey.get(spec.key);
    const declared = row?.declared ?? null;
    const satisfied = isSatisfied(declared);
    domainCompletion[spec.domain].total++;
    if (satisfied) domainCompletion[spec.domain].declared++;
    descriptors.push({
      key: spec.key,
      domain: spec.domain,
      declared,
      metadata: (row?.metadata as Record<string, unknown> | null) ?? null,
      status: (row?.status as string | null) ?? null,
      satisfied,
    });
  }

  // Use current time consistent with the rest of the codebase — the
  // recompute layer reads this on the same tick.
  const sealedAt = new Date().toISOString();

  return {
    descriptors,
    meta: {
      snapshot_version: SNAPSHOT_VERSION,
      sealed_at: sealedAt,
      descriptor_count: descriptors.length,
      domain_completion: domainCompletion,
      brand_identity_id: brandIdentityId,
    },
  };
}

function isSatisfied(declared: unknown): boolean {
  if (declared === null || declared === undefined) return false;
  if (typeof declared === "string") return declared.trim().length > 0;
  if (Array.isArray(declared)) return declared.length > 0;
  if (typeof declared === "object")
    return Object.keys(declared as Record<string, unknown>).length > 0;
  return Boolean(declared);
}

/**
 * Seal the current brand_descriptor state as an immutable snapshot.
 * Returns {persisted: false, reason} when seal preconditions aren't met
 * (no business, no brand_identity, or domains incomplete). On persist,
 * returns the new substrate id + run number.
 */
export async function sealBrandIdentitySnapshot(args: {
  businessId: string;
}): Promise<SealResult> {
  const { businessId } = args;
  const [biz] = await sql`
    SELECT id,
           (SELECT id FROM brand_identity WHERE business_id = businesses.id AND is_primary = true LIMIT 1) AS brand_identity_id
    FROM businesses WHERE id = ${businessId} LIMIT 1
  `;
  if (!biz) return { persisted: false, reason: "business not found" };
  const brandIdentityId = biz.brand_identity_id as string | null;
  if (!brandIdentityId)
    return { persisted: false, reason: "brand_identity not yet provisioned" };

  const payload = await buildSnapshotPayload({ businessId, brandIdentityId });

  // Precondition: all 4 domains must be 100% declared. Surfaces consume
  // the snapshot expecting a complete catalog; partial seals are forbidden.
  const incomplete = (Object.entries(payload.meta.domain_completion) as Array<
    [BrandDomain, { declared: number; total: number }]
  >).filter(([, c]) => c.declared < c.total);
  if (incomplete.length > 0) {
    const desc = incomplete
      .map(([d, c]) => `${d}: ${c.declared}/${c.total}`)
      .join(", ");
    return {
      persisted: false,
      reason: `Cannot seal — domain completion incomplete (${desc})`,
    };
  }

  const { id, runNumber } = await upsertSubstrate({
    businessId,
    kind: "brand_identity_snapshot",
    payload: payload as unknown as Record<string, unknown>,
    generationMetadata: {
      model: "n/a",
      prompt_version: SNAPSHOT_VERSION,
      generated_at: payload.meta.sealed_at,
      inputs: {
        brand_identity_id: brandIdentityId,
        descriptor_count: payload.descriptors.length,
      },
    },
  });

  return {
    persisted: true,
    substrateId: id,
    runNumber,
    descriptorCount: payload.descriptors.length,
  };
}

/**
 * Latest snapshot for a business — null when never sealed.
 * History (older runs) is read separately when needed.
 */
export async function getLatestSnapshot(businessId: string): Promise<{
  id: string;
  runNumber: number;
  payload: SnapshotPayload;
  generatedAt: string | null;
} | null> {
  const [row] = await sql`
    SELECT id, run_number, payload, generation_metadata
    FROM business_substrate
    WHERE business_id = ${businessId} AND kind = 'brand_identity_snapshot'
    ORDER BY run_number DESC
    LIMIT 1
  `;
  if (!row) return null;
  const gm = row.generation_metadata as { generated_at?: string } | null;
  return {
    id: row.id as string,
    runNumber: row.run_number as number,
    payload: row.payload as SnapshotPayload,
    generatedAt: gm?.generated_at ?? null,
  };
}

/**
 * Snapshot history (all runs, newest first). Cap at a reasonable limit —
 * agency reviews typically focus on the last few seals.
 */
export async function getSnapshotHistory(
  businessId: string,
  limit = 20,
): Promise<
  Array<{ id: string; runNumber: number; generatedAt: string | null; descriptorCount: number }>
> {
  const rows = await sql`
    SELECT id, run_number, generation_metadata, payload
    FROM business_substrate
    WHERE business_id = ${businessId} AND kind = 'brand_identity_snapshot'
    ORDER BY run_number DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => {
    const gm = r.generation_metadata as { generated_at?: string } | null;
    const p = r.payload as SnapshotPayload;
    return {
      id: r.id as string,
      runNumber: r.run_number as number,
      generatedAt: gm?.generated_at ?? null,
      descriptorCount: p.meta?.descriptor_count ?? p.descriptors?.length ?? 0,
    };
  });
}
