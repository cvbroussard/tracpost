/**
 * Observation → declared approval lib.
 *
 * Tier 2 of the Phase 3 review surface: owner approves a per-descriptor
 * observation as canonical, copying the substrate's observed value into
 * `brand_descriptor.declared` for that descriptor. Per
 * [[observation-driven-readiness-audit]] Scenario 2 — but minimal for now:
 * pure approve, no diff detection, no overwrite confirmation. Higher-tier
 * consultation flows (re-approval on substrate refresh, per-finding edits,
 * voice-templated prompts) layer on top.
 *
 * Writes are direct SQL — `setDeclared()` carries owner-editing semantics
 * (stale-on-edit, validator-findings preservation, owner_original lock) that
 * don't apply when the source is observation approval. The metadata column
 * carries explicit `declared_source` + `observation_approval` provenance so
 * the UI can distinguish observation-approved from owner-typed declarations.
 */
import "server-only";
import { sql } from "@/lib/db";
import { getDescriptorByKey } from "./catalog";
import type { BrandIdentityObservationPayload } from "./aesthetic-observation-types";
import type { BrandDomain } from "./catalog";

/** Per-descriptor declared-source provenance. */
export type DeclaredSource = "owner_typed" | "observation_approved";

export interface DescriptorApprovalStatus {
  source: DeclaredSource | null;
  /** ISO timestamp of when observation_approved was committed. */
  approvedAt?: string | null;
  /** Substrate row id that the approval was committed against. */
  observationSubstrateId?: string | null;
  /** True iff declared has any content (regardless of source). */
  hasDeclared: boolean;
}

/**
 * Approve the observed value for one descriptor as that descriptor's declared
 * canonical. Overwrites any prior declared content (Tier 2 has no overwrite
 * confirmation — that's Tier 3 consultation territory).
 *
 * The substrate id is required and must match the current substrate row's id —
 * prevents approving a stale view of the deliverable after a re-extraction has
 * refreshed the observation. If the substrate id has drifted, the approval
 * fails and the UI prompts the owner to re-read the current observation.
 */
export async function approveObservationDescriptor(args: {
  brandIdentityId: string;
  businessId: string;
  descriptorKey: string;
  expectedSubstrateId: string;
}): Promise<{ committed: boolean; reason?: string }> {
  const { brandIdentityId, businessId, descriptorKey, expectedSubstrateId } = args;

  const spec = getDescriptorByKey(descriptorKey);
  if (!spec) {
    return { committed: false, reason: `unknown descriptor '${descriptorKey}'` };
  }

  // Read the current substrate row + sanity-check id match.
  const [substrateRow] = await sql`
    SELECT id, payload
    FROM business_substrate
    WHERE business_id = ${businessId} AND kind = 'public_presence_observation'
    LIMIT 1
  `;
  if (!substrateRow) {
    return { committed: false, reason: "no observation substrate exists for this brand" };
  }
  if (substrateRow.id !== expectedSubstrateId) {
    return {
      committed: false,
      reason: `substrate has been refreshed since this view loaded (expected ${expectedSubstrateId}, current ${substrateRow.id})`,
    };
  }

  const payload = substrateRow.payload as BrandIdentityObservationPayload;
  const observedValue = extractObservedForDescriptor(payload, spec.domain, descriptorKey);
  if (observedValue === null) {
    return { committed: false, reason: `descriptor '${descriptorKey}' has no observable value in this substrate (null slot)` };
  }

  const approvedAt = new Date().toISOString();
  await sql`
    UPDATE brand_descriptor
    SET declared = ${JSON.stringify(observedValue)}::jsonb,
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
          declared_source: "observation_approved",
          observation_approval: {
            substrate_id: substrateRow.id,
            substrate_kind: "public_presence_observation",
            approved_at: approvedAt,
          },
        })}::jsonb,
        status = COALESCE(status, 'declared_only'),
        updated_at = now()
    WHERE brand_identity_id = ${brandIdentityId}
      AND domain = ${spec.domain}
      AND key = ${descriptorKey}
  `;

  return { committed: true };
}

/**
 * Read per-descriptor declared-source state for an entire brand identity.
 * Used by the Phase 3 UI to render approve-vs-approved-vs-owner-typed state
 * per descriptor card without a per-card round-trip.
 */
export async function getDescriptorApprovalStatuses(
  brandIdentityId: string,
): Promise<Record<string, DescriptorApprovalStatus>> {
  const rows = await sql`
    SELECT key, declared, metadata
    FROM brand_descriptor
    WHERE brand_identity_id = ${brandIdentityId}
  `;

  const out: Record<string, DescriptorApprovalStatus> = {};
  for (const r of rows) {
    const metadata = (r.metadata as Record<string, unknown> | null) ?? {};
    const declaredSource = metadata.declared_source as DeclaredSource | undefined;
    const observationApproval = metadata.observation_approval as
      | { substrate_id?: string; approved_at?: string }
      | undefined;
    const hasDeclared = r.declared !== null && r.declared !== undefined && r.declared !== "";

    out[r.key as string] = {
      source: declaredSource ?? (hasDeclared ? "owner_typed" : null),
      approvedAt: observationApproval?.approved_at ?? null,
      observationSubstrateId: observationApproval?.substrate_id ?? null,
      hasDeclared,
    };
  }
  return out;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Pull the `observed` value for a descriptor out of the observation payload.
 * Returns null when the slot is null (not observable) — caller treats that
 * as a non-approvable descriptor.
 */
function extractObservedForDescriptor(
  payload: BrandIdentityObservationPayload,
  domain: BrandDomain,
  key: string,
): unknown {
  const domainBlock = payload[domain] as Record<string, unknown> | undefined;
  if (!domainBlock) return null;
  const slot = domainBlock[key] as { observed?: unknown } | null;
  if (slot === null || slot === undefined) return null;
  return slot.observed ?? null;
}
