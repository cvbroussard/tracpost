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
export type SubstrateKind =
  | "public_presence_observation"
  | "readiness_findings"
  | "mechanical_style_examples"
  | "lexicon_axes"
  | "environmental_look_examples"
  | "subject_style_examples"
  | "tagline_examples"
  | "tone_effect_recommendation"
  | "voice_source_character_recommendation";

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
  /** 1-indexed; increments per APPEND for versioned kinds. Non-versioned
   *  kinds (upsert pattern) keep run_number=1 always. */
  runNumber: number;
  payload: P;
  generationMetadata: GenerationMetadata | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Kinds that follow the APPEND pattern — each regeneration inserts a NEW
 * row with incremented run_number, preserving history for diff/compare.
 *
 * Per [[ppa-cma-recurring-quality-gate]]: PPA and findings are recurring
 * measurement passes, not one-shot. Their history is the deliverable.
 *
 * All OTHER kinds follow the UPSERT pattern (regen REPLACES) — these are
 * "current state" substrate, not measurements.
 */
const APPEND_KINDS: ReadonlySet<SubstrateKind> = new Set([
  "public_presence_observation",
  "readiness_findings",
]);

/**
 * Upsert OR append a substrate row, dispatching by kind:
 *   - APPEND_KINDS (PPA, findings) → INSERT with run_number = MAX+1; preserves history
 *   - All others → UPSERT against run_number=1 (existing replace-on-regen semantics)
 *
 * Call sites don't need to know which pattern applies — they just write.
 * Per [[ppa-cma-recurring-quality-gate]] step 1.
 */
export async function upsertSubstrate<P extends Record<string, unknown>>(args: {
  businessId: string;
  kind: SubstrateKind;
  payload: P;
  generationMetadata: GenerationMetadata;
}): Promise<{ id: string; created: boolean; runNumber: number }> {
  const { businessId, kind, payload, generationMetadata } = args;
  if (APPEND_KINDS.has(kind)) {
    return appendSubstrate({ businessId, kind, payload, generationMetadata });
  }
  return upsertNonVersionedSubstrate({ businessId, kind, payload, generationMetadata });
}

async function upsertNonVersionedSubstrate<P extends Record<string, unknown>>(args: {
  businessId: string;
  kind: SubstrateKind;
  payload: P;
  generationMetadata: GenerationMetadata;
}): Promise<{ id: string; created: boolean; runNumber: number }> {
  const { businessId, kind, payload, generationMetadata } = args;
  const id = randomUUID();
  const [row] = await sql`
    INSERT INTO business_substrate (id, business_id, kind, payload, generation_metadata, run_number)
    VALUES (
      ${id},
      ${businessId},
      ${kind},
      ${JSON.stringify(payload)}::jsonb,
      ${JSON.stringify(generationMetadata)}::jsonb,
      1
    )
    ON CONFLICT (business_id, kind, run_number) DO UPDATE
      SET payload             = EXCLUDED.payload,
          generation_metadata = EXCLUDED.generation_metadata,
          updated_at          = now()
    RETURNING id, (xmax = 0) AS created, run_number
  `;
  return {
    id: row.id as string,
    created: Boolean(row.created),
    runNumber: row.run_number as number,
  };
}

/**
 * Append a NEW substrate row with run_number = MAX(existing) + 1 for the
 * given (business, kind). Used for versioned kinds (PPA, findings) where
 * history must be preserved.
 *
 * Concurrency: MAX+1 has a theoretical race window but PPA/findings runs
 * are triggered one at a time (operator action, never concurrent). If two
 * append calls race, the unique (business, kind, run_number) constraint
 * fires and the second caller retries via the try/catch. Cheap insurance.
 */
export async function appendSubstrate<P extends Record<string, unknown>>(args: {
  businessId: string;
  kind: SubstrateKind;
  payload: P;
  generationMetadata: GenerationMetadata;
}): Promise<{ id: string; created: boolean; runNumber: number }> {
  const { businessId, kind, payload, generationMetadata } = args;

  for (let attempt = 0; attempt < 3; attempt++) {
    const id = randomUUID();
    try {
      const [row] = await sql`
        INSERT INTO business_substrate (id, business_id, kind, payload, generation_metadata, run_number)
        VALUES (
          ${id},
          ${businessId},
          ${kind},
          ${JSON.stringify(payload)}::jsonb,
          ${JSON.stringify(generationMetadata)}::jsonb,
          COALESCE(
            (SELECT MAX(run_number) FROM business_substrate WHERE business_id = ${businessId} AND kind = ${kind}),
            0
          ) + 1
        )
        RETURNING id, run_number
      `;
      return {
        id: row.id as string,
        created: true,
        runNumber: row.run_number as number,
      };
    } catch (e) {
      // Unique-constraint race: another writer claimed our computed run_number. Retry.
      const msg = e instanceof Error ? e.message : String(e);
      const isUniqueConflict = msg.includes("uq_business_substrate_kind_run") || msg.includes("23505");
      if (!isUniqueConflict || attempt === 2) throw e;
    }
  }
  throw new Error("appendSubstrate: exhausted retries");
}

/**
 * Read the LATEST substrate row for a (business, kind) — i.e., the row with
 * the highest run_number. For non-versioned kinds this is always run_number=1.
 *
 * Backward compatible: all existing callers continue to work. To access
 * historical runs, use getSubstrateRun(businessId, kind, runNumber) or
 * listSubstrateRuns(businessId, kind).
 */
export async function getSubstrate<P = Record<string, unknown>>(
  businessId: string,
  kind: SubstrateKind,
): Promise<SubstrateRow<P> | null> {
  const [row] = await sql`
    SELECT id, business_id, kind, run_number, payload, generation_metadata, created_at, updated_at
    FROM business_substrate
    WHERE business_id = ${businessId} AND kind = ${kind}
    ORDER BY run_number DESC
    LIMIT 1
  `;
  if (!row) return null;
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    kind: row.kind as SubstrateKind,
    runNumber: row.run_number as number,
    payload: row.payload as P,
    generationMetadata: row.generation_metadata as GenerationMetadata | null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

/**
 * Read a SPECIFIC run of a (business, kind). Returns null if that run doesn't
 * exist. Used for historical comparison (e.g., comparing PPA run 1 vs run 2).
 */
export async function getSubstrateRun<P = Record<string, unknown>>(
  businessId: string,
  kind: SubstrateKind,
  runNumber: number,
): Promise<SubstrateRow<P> | null> {
  const [row] = await sql`
    SELECT id, business_id, kind, run_number, payload, generation_metadata, created_at, updated_at
    FROM business_substrate
    WHERE business_id = ${businessId} AND kind = ${kind} AND run_number = ${runNumber}
    LIMIT 1
  `;
  if (!row) return null;
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    kind: row.kind as SubstrateKind,
    runNumber: row.run_number as number,
    payload: row.payload as P,
    generationMetadata: row.generation_metadata as GenerationMetadata | null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  };
}

/**
 * List all runs for a (business, kind), most-recent first. Used for run
 * history UI + diff computations.
 */
export async function listSubstrateRuns<P = Record<string, unknown>>(
  businessId: string,
  kind: SubstrateKind,
): Promise<SubstrateRow<P>[]> {
  const rows = await sql`
    SELECT id, business_id, kind, run_number, payload, generation_metadata, created_at, updated_at
    FROM business_substrate
    WHERE business_id = ${businessId} AND kind = ${kind}
    ORDER BY run_number DESC
  `;
  return rows.map((row) => ({
    id: row.id as string,
    businessId: row.business_id as string,
    kind: row.kind as SubstrateKind,
    runNumber: row.run_number as number,
    payload: row.payload as P,
    generationMetadata: row.generation_metadata as GenerationMetadata | null,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
  }));
}
