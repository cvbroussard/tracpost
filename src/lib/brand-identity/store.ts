/**
 * Brand-identity write/read library — the engine the ops interview page (and, later,
 * the agy re-skin + a subscriber wizard) sits on top of. Scope-parameterized on
 * `business → brand_identity`; NOT welded to any route. The CALLER (route/surface)
 * is responsible for the reach check — this lib trusts it's invoked with an
 * authorized scope.
 *
 * Design: tracpost-brand-identity-schema memory. A brand identity is a SET OF
 * DESCRIPTORS; createBrandIdentity seeds one row per catalog entry, and the
 * interview UPDATEs `declared` / binds assets. Extraction (a later workflow) writes
 * `extracted`.
 */
import "server-only";
import { randomUUID } from "crypto";
import { sql } from "@/lib/db";
import {
  BRAND_DESCRIPTOR_CATALOG,
  getDescriptorByKey,
  type BrandDomain,
  type DescriptorSpec,
} from "./catalog";

function requireSpec(key: string): DescriptorSpec {
  const spec = getDescriptorByKey(key);
  if (!spec) throw new Error(`brand-identity: unknown descriptor key '${key}'`);
  return spec;
}

export type DescriptorStatus =
  | "declared_only"
  | "extracting"
  | "extracted"
  | "failed"
  | "stale";

/** The uniform envelope every descriptor's `extracted` JSONB carries. */
export interface ExtractedEnvelope {
  /** One-line human-readable distillation — uniform across every descriptor. */
  summary: string;
  /** Descriptor-specific structured payload — shape differs per descriptor. */
  value: Record<string, unknown>;
}

export interface BrandIdentity {
  id: string;
  businessId: string;
  isPrimary: boolean;
  name: string | null;
  slug: string | null;
  source: string | null;
  version: number;
}

export interface DescriptorAsset {
  assetId: string;
  role: string | null;
  position: number;
}

/**
 * Shape of `brand_descriptor.declared` (JSONB column).
 *  - Descriptors WITHOUT `spec.inputs`: a string (or null) — single-textarea flow.
 *  - Descriptors WITH `spec.inputs` (e.g. `offer`): an object keyed by each
 *    input's `key`. List inputs hold string[]; prose inputs hold string.
 */
export type DeclaredValue = string | Record<string, unknown> | null;

export interface DescriptorRecord {
  id: string;
  domain: BrandDomain;
  key: string;
  label: string | null;
  declared: DeclaredValue;
  extracted: unknown | null;
  extractedInputs: unknown | null;
  extractionModel: string | null;
  extractedAt: string | null;
  extractionConfidence: number | null;
  status: DescriptorStatus | null;
  position: number;
  /** Per-descriptor configuration (e.g. baseline opt-outs for guardrails). */
  metadata: Record<string, unknown> | null;
  assets: DescriptorAsset[];
  /** Catalog metadata (media/lean/override) for the descriptor, if it's a known key. */
  spec: DescriptorSpec | null;
}

export interface BrandIdentityWithDescriptors {
  identity: BrandIdentity;
  descriptors: DescriptorRecord[];
}

export interface CreateBrandIdentityInput {
  businessId: string;
  name?: string | null;
  slug?: string | null;
  isPrimary?: boolean;
  source?: string | null;
}

/**
 * Create a brand_identity and seed one brand_descriptor row per catalog entry
 * (declared/extracted empty, status NULL). One atomic transaction.
 */
export async function createBrandIdentity(
  input: CreateBrandIdentityInput,
): Promise<{ brandIdentityId: string }> {
  const {
    businessId,
    name = null,
    slug = null,
    isPrimary = false,
    source = "manual",
  } = input;

  const brandIdentityId = randomUUID();

  const queries = [
    sql`
      INSERT INTO brand_identity (id, business_id, is_primary, name, slug, source)
      VALUES (${brandIdentityId}, ${businessId}, ${isPrimary}, ${name}, ${slug}, ${source})
    `,
    ...BRAND_DESCRIPTOR_CATALOG.map((d, i) =>
      sql`
        INSERT INTO brand_descriptor (id, brand_identity_id, domain, key, label, position)
        VALUES (${randomUUID()}, ${brandIdentityId}, ${d.domain}, ${d.key}, ${d.label}, ${i})
      `,
    ),
  ];

  await sql.transaction(queries);
  return { brandIdentityId };
}

/** The primary brand_identity for a business, or null. */
export async function getPrimaryBrandIdentityId(
  businessId: string,
): Promise<string | null> {
  const [row] = await sql`
    SELECT id FROM brand_identity
    WHERE business_id = ${businessId} AND is_primary = true
    LIMIT 1
  `;
  return row?.id ?? null;
}

/** Get-or-create the primary brand identity for a business. */
export async function ensureBrandIdentity(
  businessId: string,
  name?: string | null,
): Promise<{ brandIdentityId: string; created: boolean }> {
  const existing = await getPrimaryBrandIdentityId(businessId);
  if (existing) return { brandIdentityId: existing, created: false };
  const { brandIdentityId } = await createBrandIdentity({
    businessId,
    name: name ?? null,
    isPrimary: true,
  });
  return { brandIdentityId, created: true };
}

/**
 * Set the declared value for a descriptor. Accepts either a string (single-
 * textarea descriptors) or a structured object (descriptors with `spec.inputs`).
 * Persists as JSONB. Marks the row `stale` if an extraction already exists
 * (declared changed → re-extract), else `declared_only`.
 *
 * Optional `provenance` parameter records per-input/per-slot content provenance
 * (e.g. `{ benefits: ["ai_suggested","ai_suggested","owner_typed",...] }`) into
 * `metadata.provenance`. Used when adoptiang validator suggestions to track
 * how much of a brand identity is AI-suggested vs owner-authored.
 */
export async function setDeclared(
  brandIdentityId: string,
  key: string,
  declared: DeclaredValue,
  provenance?: Record<string, unknown>,
): Promise<void> {
  const spec = requireSpec(key);
  const json = declared === null ? null : JSON.stringify(declared);

  // Read existing declared + validationFindings before we overwrite, so we
  // can compute scope-aware stale-on-edit: only findings for affected scopes
  // are dropped; findings for unchanged scopes survive.
  const [existingRow] = await sql`
    SELECT declared, metadata
    FROM brand_descriptor
    WHERE brand_identity_id = ${brandIdentityId}
      AND domain = ${spec.domain}
      AND key = ${key}
    LIMIT 1
  `;
  const oldDeclared = (existingRow?.declared ?? null) as DeclaredValue;
  const existingMetadata =
    (existingRow?.metadata as Record<string, unknown> | null) ?? {};
  const existingVf =
    (existingMetadata.validationFindings as Record<string, unknown> | null) ?? null;
  const existingOwnerOriginal =
    (existingMetadata.owner_original as Record<string, unknown> | null) ?? {};
  const existingSubstrate =
    (existingMetadata.extracted_substrate as Record<string, { facts?: unknown }> | null) ??
    {};
  const existingFindings: Array<{ inputKey: string }> = Array.isArray(existingVf?.findings)
    ? (existingVf.findings as Array<{ inputKey: string }>)
    : [];

  // Per [[descriptor-design-protocol]]: identify affected scopes by per-input
  // diff. Edit a list input → "lists" scope is dirty. Edit a prose input →
  // "prose:<key>" scope is dirty. Findings in unaffected scopes are preserved.
  const affectedScopes = computeAffectedScopes(spec, oldDeclared, declared);
  const keptFindings = existingFindings.filter((f) => {
    const fScope = inputKeyScope(spec, f.inputKey);
    return !affectedScopes.has(fScope);
  });
  const vfPayload =
    keptFindings.length > 0 && existingVf
      ? { ...existingVf, findings: keptFindings }
      : null;

  // SUBSTRATE-CONDITIONAL OWNER_ORIGINAL LOCK (locked 2026-05-31):
  // The locked anchor (`metadata.owner_original.<inputKey>`) is replaceable
  // by new owner-typed content UNTIL substrate exists for that input (i.e.,
  // `metadata.extracted_substrate.<inputKey>.facts.length > 0`). Once Stage 1
  // has produced a non-empty facts list, the anchor LOCKS and subsequent saves
  // can no longer mutate it (only the explicit Reset action can).
  //
  // This handles the realistic owner workflow (per [[brand-identity-schema]]
  // owners-embellish principle): an owner's first save may be hype-only with
  // no extractable substrate. Validate surfaces "needs substrate"; owner
  // re-enters; the new prose REPLACES the unlocked anchor; Stage 1 extracts
  // facts; anchor locks. The owner's iteration to a substrate-rich version
  // is supported without needing to manually reset.
  const ownerAuthored = computeOwnerAuthoredUpdates(spec, declared, provenance);
  const finalOwnerOriginal: Record<string, unknown> = {};
  const allOwnerOriginalKeys = new Set<string>([
    ...Object.keys(ownerAuthored),
    ...Object.keys(existingOwnerOriginal),
  ]);
  for (const k of allOwnerOriginalKeys) {
    const newVal = ownerAuthored[k];
    const oldVal = existingOwnerOriginal[k];
    const subEntry = existingSubstrate[k];
    const isLocked =
      !!subEntry &&
      Array.isArray(subEntry.facts) &&
      (subEntry.facts as unknown[]).length > 0;
    if (isLocked) {
      // Locked anchor — preserve existing regardless of new owner-typed value.
      finalOwnerOriginal[k] = oldVal;
    } else if (newVal !== undefined) {
      // Unlocked anchor + new owner-typed value → replace tentative anchor.
      finalOwnerOriginal[k] = newVal;
    } else if (oldVal !== undefined) {
      // Unlocked but no new value for this key → keep existing as tentative.
      finalOwnerOriginal[k] = oldVal;
    }
  }
  const finalOwnerOriginalJson = JSON.stringify(finalOwnerOriginal);

  // Provenance must reflect the source of the CURRENT declared content.
  // Owner-typed saves (no `provenance` arg, or no entry for a given key) MUST
  // clear stale "ai_suggested" markers for that input — otherwise provenance
  // lies about who authored what after the owner overrides an AI-suggested
  // value with their own typing. Compute the final provenance explicitly.
  const existingProvenance =
    (existingMetadata.provenance as Record<string, unknown> | null) ?? {};
  const finalProvenance: Record<string, unknown> = { ...existingProvenance };
  if (provenance) {
    for (const [k, v] of Object.entries(provenance)) {
      finalProvenance[k] = v;
    }
  }
  for (const k of Object.keys(ownerAuthored)) {
    // If this save came in without explicit provenance for this key, the
    // owner just typed it — clear any stale entry.
    if (provenance && k in provenance) continue;
    delete finalProvenance[k];
  }

  // Build metadata patch: provenance is REPLACED (explicit computed value);
  // owner_original is now an EXPLICIT computed value (no longer SQL `||`
  // merge) because substrate-conditional lock requires per-key logic;
  // validationFindings is either dropped (no findings survive) or replaced
  // with the kept subset.
  const patch: Record<string, unknown> = {
    provenance: finalProvenance,
  };
  if (vfPayload) patch.validationFindings = vfPayload;

  await sql`
    UPDATE brand_descriptor
    SET declared = ${json}::jsonb,
        metadata =
          (COALESCE(metadata, '{}'::jsonb) - 'validationFindings')
          || jsonb_build_object('owner_original', ${finalOwnerOriginalJson}::jsonb)
          || ${JSON.stringify(patch)}::jsonb,
        status = CASE WHEN extracted IS NOT NULL THEN 'stale' ELSE 'declared_only' END,
        updated_at = now()
    WHERE brand_identity_id = ${brandIdentityId}
      AND domain = ${spec.domain}
      AND key = ${key}
  `;
}

/**
 * Full reset for a descriptor (or scope within). Clears owner_original,
 * extracted_substrate, validation findings, AND the declared content for the
 * affected sub-inputs. Used by the UI Reset action when the owner wants to
 * start over from scratch — typically after a hype-only first attempt that
 * produced no usable substrate. Per [[brand-identity-schema]] owners-embellish
 * + substrate-conditional-lock principles.
 *
 * scope:
 *   - undefined → reset every sub-input (whole descriptor)
 *   - "lists" → reset every list-type sub-input
 *   - { prose: <key> } → reset just that prose sub-input
 */
export async function resetOwnerOriginal(
  brandIdentityId: string,
  key: string,
  scope?: "lists" | { prose: string },
): Promise<void> {
  const spec = requireSpec(key);

  const [row] = await sql`
    SELECT declared, metadata
    FROM brand_descriptor
    WHERE brand_identity_id = ${brandIdentityId}
      AND domain = ${spec.domain}
      AND key = ${key}
    LIMIT 1
  `;
  if (!row) return;

  const existingMetadata = (row.metadata as Record<string, unknown> | null) ?? {};
  const existingOwnerOriginal =
    (existingMetadata.owner_original as Record<string, unknown> | null) ?? {};
  const existingSubstrate =
    (existingMetadata.extracted_substrate as Record<string, unknown> | null) ?? {};
  const existingVf =
    (existingMetadata.validationFindings as Record<string, unknown> | null) ?? null;
  const existingFindings: Array<{ inputKey: string }> = Array.isArray(existingVf?.findings)
    ? (existingVf.findings as Array<{ inputKey: string }>)
    : [];
  const existingDeclared = (row.declared ?? null) as DeclaredValue;

  // Determine which input keys to reset
  let inputKeysToReset: string[];
  if (!scope) {
    inputKeysToReset = spec.inputs ? spec.inputs.map((i) => i.key) : ["text"];
  } else if (scope === "lists") {
    inputKeysToReset =
      spec.inputs?.filter((i) => i.inputType === "list").map((i) => i.key) ?? [];
  } else {
    inputKeysToReset = [scope.prose];
  }
  if (inputKeysToReset.length === 0) return;
  const resetSet = new Set(inputKeysToReset);

  // Clear declared for affected keys
  let newDeclared: DeclaredValue;
  if (!spec.inputs) {
    // Non-decomposed: declared is a string; clear to null
    newDeclared = null;
  } else {
    const declaredObj =
      typeof existingDeclared === "object" &&
      existingDeclared !== null &&
      !Array.isArray(existingDeclared)
        ? { ...(existingDeclared as Record<string, unknown>) }
        : {};
    for (const k of inputKeysToReset) delete declaredObj[k];
    newDeclared = Object.keys(declaredObj).length > 0 ? declaredObj : null;
  }

  // Clear owner_original + substrate for affected keys
  const newOwnerOriginal = { ...existingOwnerOriginal };
  const newSubstrate = { ...existingSubstrate };
  for (const k of inputKeysToReset) {
    delete newOwnerOriginal[k];
    delete newSubstrate[k];
  }

  // Clear provenance for affected keys (Reset is a clean slate; the prior
  // provenance entry references content that no longer exists).
  const existingProvenance =
    (existingMetadata.provenance as Record<string, unknown> | null) ?? {};
  const newProvenance = { ...existingProvenance };
  for (const k of inputKeysToReset) delete newProvenance[k];

  // Drop findings for affected keys
  const keptFindings = existingFindings.filter((f) => !resetSet.has(f.inputKey));
  const vfPayload =
    keptFindings.length > 0 && existingVf
      ? { ...existingVf, findings: keptFindings }
      : null;

  const declaredJson = newDeclared === null ? null : JSON.stringify(newDeclared);
  const patch: Record<string, unknown> = {
    owner_original: newOwnerOriginal,
    extracted_substrate: newSubstrate,
    provenance: newProvenance,
    ...(vfPayload ? { validationFindings: vfPayload } : {}),
  };

  await sql`
    UPDATE brand_descriptor
    SET declared = ${declaredJson}::jsonb,
        metadata = (
          (COALESCE(metadata, '{}'::jsonb) - 'validationFindings')
          || ${JSON.stringify(patch)}::jsonb
        ),
        status = CASE WHEN extracted IS NOT NULL THEN 'stale' ELSE 'declared_only' END,
        updated_at = now()
    WHERE brand_identity_id = ${brandIdentityId}
      AND domain = ${spec.domain}
      AND key = ${key}
  `;
}

/**
 * Determine which validation scopes are invalidated by a declared change.
 * Per-sub-input diff against the previous declared; each changed input maps
 * to its scope (lists or prose:<key>). Returns an empty set when nothing
 * changed (idempotent save).
 */
function computeAffectedScopes(
  spec: DescriptorSpec,
  oldDeclared: DeclaredValue,
  newDeclared: DeclaredValue,
): Set<string> {
  const scopes = new Set<string>();

  if (!spec.inputs) {
    // Non-decomposed: single synthetic "text" prose scope.
    const oldStr = typeof oldDeclared === "string" ? oldDeclared : "";
    const newStr = typeof newDeclared === "string" ? newDeclared : "";
    if (oldStr !== newStr) scopes.add("prose:text");
    return scopes;
  }

  const toObj = (v: DeclaredValue): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const oldObj = toObj(oldDeclared);
  const newObj = toObj(newDeclared);

  for (const input of spec.inputs) {
    const oldVal = oldObj[input.key];
    const newVal = newObj[input.key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      scopes.add(input.inputType === "list" ? "lists" : `prose:${input.key}`);
    }
  }
  return scopes;
}

/**
 * Map an input key to its validation scope identifier. Used by stale-on-edit
 * (filtering kept findings) and by the validate route (scope-aware caching +
 * scope-aware merge persist).
 */
export function inputKeyScope(spec: DescriptorSpec, inputKey: string): string {
  if (!spec.inputs) return `prose:${inputKey}`;
  const input = spec.inputs.find((i) => i.key === inputKey);
  if (!input) return `prose:${inputKey}`;
  return input.inputType === "list" ? "lists" : `prose:${inputKey}`;
}

/**
 * Member input keys for a given scope, computed from a DescriptorSpec.
 *  - "lists" → every list-type input key
 *  - "prose:<key>" → just [<key>]
 * Used by the validate route to merge scope-bounded findings without
 * clobbering findings from other scopes.
 */
export function scopeMemberKeys(spec: DescriptorSpec, scope: string): string[] {
  if (!spec.inputs) return scope === "prose:text" ? ["text"] : [];
  if (scope === "lists") {
    return spec.inputs.filter((i) => i.inputType === "list").map((i) => i.key);
  }
  if (scope.startsWith("prose:")) {
    const k = scope.slice("prose:".length);
    return spec.inputs.some((i) => i.key === k) ? [k] : [];
  }
  return [];
}

/**
 * Returns the subset of `declared` that should be captured into
 * `metadata.owner_original` on this save. Filters out sub-inputs whose
 * provenance flags them as AI-suggested (they're accepted exemplars, not
 * owner content). Empty values are also skipped. The caller's SQL applies
 * first-save-wins semantics, so this helper just enumerates candidates.
 */
function computeOwnerAuthoredUpdates(
  spec: DescriptorSpec,
  declared: DeclaredValue,
  provenance?: Record<string, unknown>,
): Record<string, unknown> {
  if (declared === null) return {};
  const updates: Record<string, unknown> = {};

  const isAiSuggested = (prov: unknown): boolean => {
    if (prov === "ai_suggested") return true;
    if (Array.isArray(prov) && prov.some((p) => p === "ai_suggested")) return true;
    return false;
  };
  const isNonEmpty = (v: unknown): boolean => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) {
      return v.some((item) => typeof item === "string" && item.trim().length > 0);
    }
    return true;
  };

  if (spec.inputs) {
    const obj =
      typeof declared === "object" && !Array.isArray(declared)
        ? (declared as Record<string, unknown>)
        : {};
    for (const input of spec.inputs) {
      const value = obj[input.key];
      if (!isNonEmpty(value)) continue;
      if (isAiSuggested(provenance?.[input.key])) continue;
      updates[input.key] = value;
    }
  } else {
    // Non-decomposed (single-textarea descriptor) — synthetic "text" key.
    if (typeof declared === "string" && declared.trim().length > 0) {
      if (!isAiSuggested(provenance?.["text"])) {
        updates["text"] = declared;
      }
    }
  }

  return updates;
}

/**
 * Persist the Stage-1 substrate extraction for a prose sub-input under
 * `metadata.extracted_substrate.{inputKey}`. The cache holds the verbatim
 * source text used at extraction time so the validator can detect drift
 * (cache hit only if source_text matches current owner_original).
 *
 * Stage 1 = "what concrete facts are in this prose"; Stage 2 = "given those
 * facts, here's a tight expression." Splitting the two breaks the prose-
 * iteration drift loop (per [[brand-identity-schema]] prose-oscillation).
 */
export interface SubstrateCachePersist {
  facts: string[];
  source_text: string;
  extracted_at: string;
  model: string;
}

export async function setExtractedSubstrate(
  brandIdentityId: string,
  key: string,
  inputKey: string,
  cache: SubstrateCachePersist,
): Promise<void> {
  const spec = requireSpec(key);
  const cacheJson = JSON.stringify(cache);
  await sql`
    UPDATE brand_descriptor
    SET metadata =
          COALESCE(metadata, '{}'::jsonb)
          || jsonb_build_object(
               'extracted_substrate',
               COALESCE(metadata->'extracted_substrate', '{}'::jsonb)
               || jsonb_build_object(${inputKey}::text, ${cacheJson}::jsonb)
             ),
        updated_at = now()
    WHERE brand_identity_id = ${brandIdentityId}
      AND domain = ${spec.domain}
      AND key = ${key}
  `;
}

/**
 * Persist validation findings for a descriptor under
 * `metadata.validationFindings`. Findings are cleared automatically by
 * `setDeclared` (stale-on-edit), so the gate stays honest.
 */
export async function setValidationFindings(
  brandIdentityId: string,
  key: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const spec = requireSpec(key);
  await sql`
    UPDATE brand_descriptor
    SET metadata =
          COALESCE(metadata, '{}'::jsonb)
          || ${JSON.stringify({ validationFindings: payload })}::jsonb,
        updated_at = now()
    WHERE brand_identity_id = ${brandIdentityId} AND domain = ${spec.domain} AND key = ${key}
  `;
}

async function descriptorIdFor(
  brandIdentityId: string,
  key: string,
): Promise<string> {
  const spec = requireSpec(key);
  const [row] = await sql`
    SELECT id FROM brand_descriptor
    WHERE brand_identity_id = ${brandIdentityId}
      AND domain = ${spec.domain}
      AND key = ${key}
    LIMIT 1
  `;
  if (!row) {
    throw new Error(
      `brand-identity: no descriptor '${key}' on brand identity ${brandIdentityId}`,
    );
  }
  return row.id as string;
}

/**
 * Bind a media asset as backing for a descriptor (M:N). Binding can invalidate an
 * existing extraction → marks the descriptor `stale`.
 */
export async function bindAsset(
  brandIdentityId: string,
  key: string,
  assetId: string,
  opts: { role?: string | null; position?: number } = {},
): Promise<void> {
  const descriptorId = await descriptorIdFor(brandIdentityId, key);
  const { role = null, position = 0 } = opts;
  await sql.transaction([
    sql`
      INSERT INTO brand_descriptor_asset (descriptor_id, asset_id, role, position)
      VALUES (${descriptorId}, ${assetId}, ${role}, ${position})
      ON CONFLICT (descriptor_id, asset_id)
      DO UPDATE SET role = EXCLUDED.role, position = EXCLUDED.position
    `,
    sql`
      UPDATE brand_descriptor
      SET status = CASE WHEN extracted IS NOT NULL THEN 'stale' ELSE status END,
          updated_at = now()
      WHERE id = ${descriptorId}
    `,
  ]);
}

/** Remove an asset binding from a descriptor. */
export async function unbindAsset(
  brandIdentityId: string,
  key: string,
  assetId: string,
): Promise<void> {
  const descriptorId = await descriptorIdFor(brandIdentityId, key);
  await sql`
    DELETE FROM brand_descriptor_asset
    WHERE descriptor_id = ${descriptorId} AND asset_id = ${assetId}
  `;
}

// ── Extraction writers (the harness persists through these) ─────────────────

/** Mark a descriptor as extraction-in-flight. */
export async function markExtracting(
  brandIdentityId: string,
  key: string,
): Promise<void> {
  const spec = requireSpec(key);
  await sql`
    UPDATE brand_descriptor
    SET status = 'extracting', updated_at = now()
    WHERE brand_identity_id = ${brandIdentityId} AND domain = ${spec.domain} AND key = ${key}
  `;
}

/**
 * Persist an extraction result: the {summary,value} envelope, the provenance
 * snapshot (extracted_inputs), the model, timestamp, and confidence. Flips
 * status → extracted.
 */
export async function setExtracted(
  brandIdentityId: string,
  key: string,
  args: {
    envelope: ExtractedEnvelope;
    inputs: Record<string, unknown>;
    model: string;
    confidence?: number | null;
  },
): Promise<void> {
  const spec = requireSpec(key);
  const { envelope, inputs, model, confidence = null } = args;
  await sql`
    UPDATE brand_descriptor
    SET extracted = ${JSON.stringify(envelope)}::jsonb,
        extracted_inputs = ${JSON.stringify(inputs)}::jsonb,
        extraction_model = ${model},
        extracted_at = now(),
        extraction_confidence = ${confidence},
        status = 'extracted',
        updated_at = now()
    WHERE brand_identity_id = ${brandIdentityId} AND domain = ${spec.domain} AND key = ${key}
  `;
}

/**
 * Persist the baselines being APPLIED for a descriptor (the baseline ids that
 * are CHECKED). Inclusion semantics: the JSON lists what's actively applied.
 * When metadata.baselinesApplied is null/missing, the page treats it as
 * "all applicable baselines apply" (default-on for fresh descriptors).
 */
export async function setBaselinesApplied(
  brandIdentityId: string,
  key: string,
  applied: string[],
): Promise<void> {
  const spec = requireSpec(key);
  await sql`
    UPDATE brand_descriptor
    SET metadata =
          COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ baselinesApplied: applied })}::jsonb,
        updated_at = now()
    WHERE brand_identity_id = ${brandIdentityId} AND domain = ${spec.domain} AND key = ${key}
  `;
}

/**
 * Read the persisted validationFindings payload for a descriptor (or null if
 * none). Used by the validate API for idempotency-by-content: stale-on-edit
 * drops these on declared change, so existence implies "content unchanged
 * since last validated" — the cached result can be returned without re-calling
 * the LLM.
 */
export async function getDescriptorFindings(
  brandIdentityId: string,
  key: string,
): Promise<Record<string, unknown> | null> {
  const spec = requireSpec(key);
  const [row] = await sql`
    SELECT metadata->'validationFindings' AS findings
    FROM brand_descriptor
    WHERE brand_identity_id = ${brandIdentityId} AND domain = ${spec.domain} AND key = ${key}
    LIMIT 1
  `;
  return (row?.findings as Record<string, unknown> | null) ?? null;
}

/** Mark a descriptor's extraction as failed (terminal), recording the error. */
export async function markExtractionFailed(
  brandIdentityId: string,
  key: string,
  error: string,
): Promise<void> {
  const spec = requireSpec(key);
  await sql`
    UPDATE brand_descriptor
    SET status = 'failed',
        extracted_inputs = ${JSON.stringify({ error })}::jsonb,
        updated_at = now()
    WHERE brand_identity_id = ${brandIdentityId} AND domain = ${spec.domain} AND key = ${key}
  `;
}

/**
 * Load the primary brand identity for a business with all descriptors + their bound
 * assets, merged with catalog spec. For the interview-page editor. Returns null if
 * no brand identity exists yet.
 */
export async function getBrandIdentity(
  businessId: string,
): Promise<BrandIdentityWithDescriptors | null> {
  const [identityRow] = await sql`
    SELECT id, business_id, is_primary, name, slug, source, version
    FROM brand_identity
    WHERE business_id = ${businessId} AND is_primary = true
    LIMIT 1
  `;
  if (!identityRow) return null;

  const descriptorRows = await sql`
    SELECT id, domain, key, label, declared, extracted, extracted_inputs,
           extraction_model, extracted_at, extraction_confidence, status,
           position, metadata
    FROM brand_descriptor
    WHERE brand_identity_id = ${identityRow.id}
    ORDER BY position ASC
  `;

  const assetRows = await sql`
    SELECT bda.descriptor_id, bda.asset_id, bda.role, bda.position
    FROM brand_descriptor_asset bda
    JOIN brand_descriptor bd ON bd.id = bda.descriptor_id
    WHERE bd.brand_identity_id = ${identityRow.id}
    ORDER BY bda.position ASC
  `;

  const assetsByDescriptor = new Map<string, DescriptorAsset[]>();
  for (const a of assetRows) {
    const list = assetsByDescriptor.get(a.descriptor_id) ?? [];
    list.push({ assetId: a.asset_id, role: a.role, position: a.position });
    assetsByDescriptor.set(a.descriptor_id, list);
  }

  const descriptors: DescriptorRecord[] = descriptorRows.map((r) => ({
    id: r.id,
    domain: r.domain,
    key: r.key,
    label: r.label,
    declared: r.declared,
    extracted: r.extracted,
    extractedInputs: r.extracted_inputs,
    extractionModel: r.extraction_model,
    extractedAt: r.extracted_at,
    extractionConfidence:
      r.extraction_confidence === null ? null : Number(r.extraction_confidence),
    status: r.status,
    position: r.position,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    assets: assetsByDescriptor.get(r.id) ?? [],
    spec: getDescriptorByKey(r.key) ?? null,
  }));

  return {
    identity: {
      id: identityRow.id,
      businessId: identityRow.business_id,
      isPrimary: identityRow.is_primary,
      name: identityRow.name,
      slug: identityRow.slug,
      source: identityRow.source,
      version: identityRow.version,
    },
    descriptors,
  };
}
