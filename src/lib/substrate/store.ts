/**
 * Substrate-layer read/write primitives.
 *
 * Per [[substrate-libraries-layer]]: system-derived intelligence persists in a
 * separate store from owner-authoritative declared values. v1 ships the storage
 * primitive only — the full architecture (kind registry / dispatcher / invalidation
 * system / six consumers) is deferred. Callers reach for these helpers directly
 * until the registry lands.
 *
 * First kind: `public_presence_observation` (Phase 2 of [[brand-identity-research-architecture]]).
 */
import "server-only";
import { randomUUID } from "crypto";
import { sql } from "@/lib/db";

/**
 * Substrate kinds. Naming convention: `<analysis_or_inventory>_<noun>`. The
 * public_presence_observation kind is the output of the public presence
 * analysis pipeline (website + GBP + signage + public social profile presence)
 * — what TracPost found when it "reached into the wild" for a brand. Sibling
 * to the CMA at the same temporal/source-class tier; both bundle as the
 * agency's opening-move deliverable per [[observation-driven-readiness-audit]].
 * Other observation pipelines (audio_identity_observation,
 * print_identity_observation, production_output_drift) compose alongside but
 * don't bundle with the intake pair.
 */
export type SubstrateKind = "public_presence_observation";

export interface GenerationMetadata {
  model: string;
  prompt_version: string;
  inputs_hash?: string | null;
  generated_at: string;
  /** Self-reported confidence from the generator, if applicable. 0..1. */
  confidence?: number | null;
  /** Provenance of the inputs the generator consumed. Free-form per-kind. */
  inputs?: Record<string, unknown>;
}

export interface SubstrateRow<P = Record<string, unknown>> {
  id: string;
  businessId: string;
  kind: SubstrateKind;
  payload: P;
  generationMetadata: GenerationMetadata | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Upsert a substrate row. One row per (business, kind) — regenerating REPLACES.
 * The locked recall property in [[substrate-libraries-layer]] (multi-suggestion
 * array shape) is preserved by storing the alternatives inside the payload, not
 * by accumulating rows. When future kinds need multi-row semantics, drop the
 * (business_id, kind) unique constraint and add a discriminator at that time.
 */
export async function upsertSubstrate<P extends Record<string, unknown>>(args: {
  businessId: string;
  kind: SubstrateKind;
  payload: P;
  generationMetadata: GenerationMetadata;
}): Promise<{ id: string; created: boolean }> {
  const { businessId, kind, payload, generationMetadata } = args;
  const id = randomUUID();
  const [row] = await sql`
    INSERT INTO business_substrate (id, business_id, kind, payload, generation_metadata)
    VALUES (
      ${id},
      ${businessId},
      ${kind},
      ${JSON.stringify(payload)}::jsonb,
      ${JSON.stringify(generationMetadata)}::jsonb
    )
    ON CONFLICT (business_id, kind) DO UPDATE
      SET payload             = EXCLUDED.payload,
          generation_metadata = EXCLUDED.generation_metadata,
          updated_at          = now()
    RETURNING id, (xmax = 0) AS created
  `;
  return { id: row.id as string, created: Boolean(row.created) };
}

/**
 * Read the current substrate row for a (business, kind). Returns null if none.
 */
export async function getSubstrate<P = Record<string, unknown>>(
  businessId: string,
  kind: SubstrateKind,
): Promise<SubstrateRow<P> | null> {
  const [row] = await sql`
    SELECT id, business_id, kind, payload, generation_metadata, created_at, updated_at
    FROM business_substrate
    WHERE business_id = ${businessId} AND kind = ${kind}
    LIMIT 1
  `;
  if (!row) return null;
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    kind: row.kind as SubstrateKind,
    payload: row.payload as P,
    generationMetadata: row.generation_metadata as GenerationMetadata | null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}
