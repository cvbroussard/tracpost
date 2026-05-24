/**
 * Cascade analyze — single entry point for the briefing-complete LLM
 * pipeline. Internally runs NER (Haiku) then vision (Sonnet) and merges
 * both passes into one CascadeAnalysis artifact.
 *
 * Decision rationale (2026-05-16): the prior two-stage split (Stage 1 /
 * Stage 2) was theoretical decoupling that never paid off. In practice
 * the analysis fires once per asset (recording → cascade), the vision
 * pass depends on NER output as anchoring, and there's no caching or
 * partial-re-run scenario that benefits from splitting them. The split
 * became conceptual overhead. Collapsing yields:
 *
 *   - One trigger, one preview, one artifact (matches the once-per-asset
 *     lifecycle)
 *   - Same cost (~$0.025): NER stays on Haiku, vision stays on Sonnet —
 *     model specialization still earns its keep
 *   - Same latency (~5-6s sequential — the two calls have a data
 *     dependency that prevents parallelization)
 *   - Lower code surface: external consumers see runCascade() only
 *
 * Cost: ~$0.025 per call (Haiku NER $0.005 + Sonnet vision $0.02).
 * Latency: ~5-6s (NER ~1s + vision ~3-5s, sequential).
 * No persistence — preview is read-only. Commit via cascade-commit.ts.
 */
import "server-only";
import { extractNer, NER_MODEL, type NerResult } from "./ner-extract";
import {
  analyzeVision,
  VISION_MODEL,
  type VisionResult,
  type VisionInput,
  type PillarConfigEntry,
  type AssetCategoryCollection,
  type CaptionHints,
  type MotionSequence,
} from "./vision-analyze";

export type { PillarConfigEntry } from "./vision-analyze";

/**
 * The canonical asset-analysis artifact. Flat shape — entities (from
 * NER pass) and visual outputs (from vision pass) live alongside each
 * other. Provenance fields at the bottom.
 *
 * Persisted as-is into media_assets.ai_analysis JSONB.
 */
export interface CascadeAnalysis {
  // From NER pass
  entities: NerResult["entities"];
  suggested_tags: string[];

  // From vision pass
  asset_categories: AssetCategoryCollection;
  scene_types: string[];
  url_slug: string;
  story_angles: string[];
  suggested_pillar: string | null;
  caption_hints: CaptionHints;
  motion_sequence: MotionSequence;

  // Provenance
  generated_at: string;
  model_versions: { ner: string; vision: string };
  cost: {
    ner_input_tokens: number;
    ner_output_tokens: number;
    vision_input_tokens: number;
    vision_output_tokens: number;
  };
}

export interface CascadeInput {
  assetId: string;
  imageUrl: string;
  transcript: string;
  siteCategories: VisionInput["siteCategories"];
  pillarConfig: PillarConfigEntry[];
  brandDnaDigest: string | null;
}

export type CascadeOutcome =
  | { status: "success"; result: CascadeAnalysis }
  | { status: "error"; stage: "ner" | "vision"; error: string }
  | { status: "skipped"; stage: "ner" | "vision"; reason: string };

export async function runCascade(input: CascadeInput): Promise<CascadeOutcome> {
  // NER pass
  const ner = await extractNer(input.transcript);
  if (ner.status === "error") return { status: "error", stage: "ner", error: ner.error };
  if (ner.status === "skipped") return { status: "skipped", stage: "ner", reason: ner.reason };

  // Vision pass — receives NER output as pre-extracted entity anchor
  const vision = await analyzeVision({
    assetId: input.assetId,
    imageUrl: input.imageUrl,
    transcript: input.transcript,
    ner: ner.result,
    siteCategories: input.siteCategories,
    brandDnaDigest: input.brandDnaDigest,
    pillarConfig: input.pillarConfig,
  });
  if (vision.status === "error") return { status: "error", stage: "vision", error: vision.error };
  if (vision.status === "skipped") return { status: "skipped", stage: "vision", reason: vision.reason };

  const analysis: CascadeAnalysis = {
    entities: ner.result.entities,
    suggested_tags: ner.result.suggested_tags,
    asset_categories: vision.result.asset_categories,
    scene_types: vision.result.scene_types,
    url_slug: vision.result.url_slug,
    story_angles: vision.result.story_angles,
    suggested_pillar: vision.result.suggested_pillar,
    caption_hints: vision.result.caption_hints,
    motion_sequence: vision.result.motion_sequence,
    generated_at: new Date().toISOString(),
    model_versions: { ner: NER_MODEL, vision: VISION_MODEL },
    cost: {
      ner_input_tokens: ner.result.cost.input_tokens,
      ner_output_tokens: ner.result.cost.output_tokens,
      vision_input_tokens: vision.result.cost.input_tokens,
      vision_output_tokens: vision.result.cost.output_tokens,
    },
  };

  return { status: "success", result: analysis };
}

// Re-export VisionResult shape because callers occasionally need the
// individual sub-types for rendering.
export type { VisionResult, NerResult };
