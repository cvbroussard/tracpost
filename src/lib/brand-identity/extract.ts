/**
 * Brand-identity extraction HARNESS (Layer 1 — data-independent).
 *
 * Orchestration + input assembly + persistence + status machine. The actual
 * per-descriptor LLM/Vision call (Layer 2 — the prompt-engineered part that
 * needs real specimens) is a pluggable `DescriptorExtractor`. A `stubExtractor`
 * lets the whole pipeline run end-to-end before the real prompts exist.
 *
 * Per descriptor: markExtracting → assemble input (declared + bound assets +
 * their enrichment graph) → extractor → setExtracted, or markExtractionFailed.
 */
import "server-only";
import { sql } from "@/lib/db";
import { getDescriptorByKey, type DescriptorSpec } from "./catalog";
import {
  markExtracting,
  setExtracted,
  markExtractionFailed,
  type ExtractedEnvelope,
} from "./store";

/** True if a declared value (string or structured object) has any non-empty content. */
function declaredHasContent(declared: unknown): boolean {
  if (typeof declared === "string") return declared.trim().length > 0;
  if (declared && typeof declared === "object") {
    return Object.values(declared as Record<string, unknown>).some((v) => {
      if (typeof v === "string") return v.trim().length > 0;
      if (Array.isArray(v))
        return v.some((s) => typeof s === "string" && s.trim().length > 0);
      return false;
    });
  }
  return false;
}

// ── Input assembly ──────────────────────────────────────────────────────────

export interface AssembledAsset {
  assetId: string;
  storageUrl: string | null;
  mediaType: string | null;
  contextNote: string | null;
  /** The asset's own transcription (media_assets.transcription). */
  transcription: string | null;
  contentTags: string[] | null;
  sceneTypes: string[] | null;
  aiAnalysis: unknown;
  assetAnalysis: unknown;
  /** Transcripts of recordings whose source_asset_id is this asset. */
  recordingTranscripts: string[];
  role: string | null;
}

export interface AssembledInput {
  domain: string;
  key: string;
  label: string | null;
  /**
   * Either a string (single-textarea descriptors) OR an object keyed by each
   * input's `key` (descriptors with `spec.inputs`, e.g. `offer`).
   */
  declared: string | Record<string, unknown> | null;
  assets: AssembledAsset[];
}

/**
 * Gather everything an extractor needs for one descriptor: its declared text +
 * each bound asset's enrichment graph (analysis + transcription + tags + any
 * linked recording transcripts). Deterministic — no model calls.
 */
export async function assembleExtractionInput(
  brandIdentityId: string,
  key: string,
): Promise<AssembledInput> {
  const spec = getDescriptorByKey(key);
  if (!spec) throw new Error(`brand-identity: unknown descriptor key '${key}'`);

  const [desc] = await sql`
    SELECT id, declared, label
    FROM brand_descriptor
    WHERE brand_identity_id = ${brandIdentityId} AND domain = ${spec.domain} AND key = ${key}
    LIMIT 1
  `;
  if (!desc) {
    throw new Error(
      `brand-identity: no descriptor '${key}' on brand identity ${brandIdentityId}`,
    );
  }

  const assetRows = await sql`
    SELECT ma.id, ma.storage_url, ma.media_type, ma.context_note, ma.transcription,
           ma.content_tags, ma.scene_types, ma.ai_analysis, ma.asset_analysis, bda.role
    FROM brand_descriptor_asset bda
    JOIN media_assets ma ON ma.id = bda.asset_id
    WHERE bda.descriptor_id = ${desc.id}
    ORDER BY bda.position ASC
  `;

  // Recording transcripts for the bound assets (the "what the owner said" layer).
  const recRows = assetRows.length
    ? await sql`
        SELECT source_asset_id, transcript
        FROM recordings
        WHERE source_asset_id IN (
          SELECT asset_id FROM brand_descriptor_asset WHERE descriptor_id = ${desc.id}
        )
        AND transcript IS NOT NULL AND transcript <> '' AND archived_at IS NULL
        ORDER BY created_at DESC
      `
    : [];
  const recByAsset = new Map<string, string[]>();
  for (const r of recRows) {
    const list = recByAsset.get(r.source_asset_id) ?? [];
    list.push(r.transcript as string);
    recByAsset.set(r.source_asset_id, list);
  }

  return {
    domain: spec.domain,
    key,
    label: desc.label,
    declared: desc.declared,
    assets: assetRows.map((a) => ({
      assetId: a.id,
      storageUrl: a.storage_url,
      mediaType: a.media_type,
      contextNote: a.context_note,
      transcription: a.transcription,
      contentTags: a.content_tags,
      sceneTypes: a.scene_types,
      aiAnalysis: a.ai_analysis,
      assetAnalysis: a.asset_analysis,
      recordingTranscripts: recByAsset.get(a.id) ?? [],
      role: a.role,
    })),
  };
}

// ── The extractor seam (Layer 2 plugs in here) ──────────────────────────────

export interface ExtractionResult {
  envelope: ExtractedEnvelope;
  model: string;
  confidence?: number | null;
  /** Provenance snapshot persisted to extracted_inputs (per persist-prompts). */
  inputsSnapshot: Record<string, unknown>;
}

export type DescriptorExtractor = (ctx: {
  spec: DescriptorSpec;
  input: AssembledInput;
}) => Promise<ExtractionResult>;

/**
 * STUB extractor — the Layer-2 seam. Produces a clearly-marked placeholder so
 * the harness (orchestration + persistence + UI) can be exercised end-to-end
 * before the real per-descriptor LLM/Vision prompts are written against actual
 * beta data. Replace per descriptor/domain during prompt engineering.
 */
export const stubExtractor: DescriptorExtractor = async ({ spec, input }) => {
  const assetIds = input.assets.map((a) => a.assetId);
  const facetsUsed = [
    input.assets.some((a) => a.transcription || a.recordingTranscripts.length) && "transcription",
    input.assets.some((a) => a.aiAnalysis || a.assetAnalysis) && "analysis",
    input.assets.some((a) => a.contextNote) && "briefing",
  ].filter(Boolean);
  return {
    envelope: {
      summary: `(stub) extraction for ${spec.domain}.${spec.key} not yet implemented`,
      value: {
        _stub: true,
        declaredEcho:
          typeof input.declared === "string"
            ? input.declared.slice(0, 200)
            : input.declared && typeof input.declared === "object"
              ? JSON.stringify(input.declared).slice(0, 200)
              : "",
        assetCount: assetIds.length,
      },
    },
    model: "stub",
    confidence: null,
    inputsSnapshot: {
      stub: true,
      declared: input.declared ?? null,
      assetIds,
      facetsUsed,
    },
  };
};

// ── The runner ───────────────────────────────────────────────────────────────

export interface RunExtractionResult {
  ran: { key: string; status: "extracted" | "failed"; error?: string }[];
  skipped: string[];
}

/**
 * Run extraction across a brand's descriptors. Targets only descriptors with
 * SOMETHING to extract from (declared text or bound assets) — empty seeds are
 * skipped. Sequential so per-descriptor status flips are observable while it
 * runs. Defaults to the stub extractor.
 *
 * NOTE: corpus-wide input for the extracted-lean descriptors (aesthetic, lexicon,
 * etc. — which mine the whole library, not a hand-bound asset set) is a Layer-2
 * addition to input assembly; for now those skip unless they have declared/assets.
 */
export async function runExtraction(
  brandIdentityId: string,
  opts: { keys?: string[]; extractor?: DescriptorExtractor } = {},
): Promise<RunExtractionResult> {
  const extractor = opts.extractor ?? stubExtractor;

  const rows = await sql`
    SELECT bd.key, bd.declared,
           (SELECT count(*) FROM brand_descriptor_asset a WHERE a.descriptor_id = bd.id)::int AS asset_count
    FROM brand_descriptor bd
    WHERE bd.brand_identity_id = ${brandIdentityId}
  `;

  const ran: RunExtractionResult["ran"] = [];
  const skipped: string[] = [];

  for (const r of rows) {
    const key = r.key as string;
    if (opts.keys && !opts.keys.includes(key)) continue;

    const hasInput =
      declaredHasContent(r.declared) || (r.asset_count as number) > 0;
    const spec = getDescriptorByKey(key);
    if (!hasInput || !spec) {
      skipped.push(key);
      continue;
    }

    try {
      await markExtracting(brandIdentityId, key);
      const input = await assembleExtractionInput(brandIdentityId, key);
      const result = await extractor({ spec, input });
      await setExtracted(brandIdentityId, key, {
        envelope: result.envelope,
        inputs: result.inputsSnapshot,
        model: result.model,
        confidence: result.confidence ?? null,
      });
      ran.push({ key, status: "extracted" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "extraction failed";
      await markExtractionFailed(brandIdentityId, key, msg).catch(() => {});
      ran.push({ key, status: "failed", error: msg });
    }
  }

  return { ran, skipped };
}
