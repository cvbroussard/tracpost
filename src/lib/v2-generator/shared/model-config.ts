/**
 * Model + token + length config for v2 generators.
 *
 * Per the v1 audit: model selection and max_tokens scaling matter
 * materially for output quality. Long-form types need Sonnet 4.6 +
 * generous token budgets; short-form types can run on Haiku 4.5
 * with smaller caps for cost.
 *
 * Single source of truth so all three generators (blog/project/service)
 * resolve the same way without code drift.
 */

/** Content types across all three pools. */
export type ContentTypeKey =
  | "authority_overview"   // blog: flagship "why us" article
  | "deep_dive"            // blog: single-topic technical authority
  | "project_story"        // blog: case-study narrative (orchestrator-driven; chapters use 'project_chapter' below)
  | "vendor_spotlight"     // blog: research-driven feature
  | "project_chapter"      // project pool: per-chapter article
  | "service_overview";    // service pool: authority-overview hub

export interface ModelConfig {
  /** Anthropic model id. */
  model: string;
  /** max_tokens cap on the LLM API call. */
  maxTokens: number;
  /** Target word range — appears in the prompt. */
  wordRange: string;
  /** Human label. */
  label: string;
}

/**
 * Map content type → model + token budget.
 *
 * Sonnet 4.6 across the board for body generation when brand DNA is
 * present (per user decision 2026-05-07). Haiku fallback only for
 * sites without DNA (rare).
 *
 * max_tokens scaled with headroom above the wordRange so the JSON
 * wrapper + meta fields don't truncate the body.
 */
export const MODEL_CONFIG: Record<ContentTypeKey, ModelConfig> = {
  authority_overview: {
    model: "claude-sonnet-4-6",
    maxTokens: 16384,
    wordRange: "1500-2000",
    label: "Authority Overview",
  },
  deep_dive: {
    model: "claude-sonnet-4-6",
    maxTokens: 12288,
    wordRange: "1000-1500",
    label: "Deep Dive",
  },
  project_story: {
    model: "claude-sonnet-4-6",
    maxTokens: 8192,
    wordRange: "800-1200",
    label: "Project Story",
  },
  vendor_spotlight: {
    model: "claude-sonnet-4-6",
    maxTokens: 12288,
    wordRange: "1000-1500",
    label: "Vendor/Material Spotlight",
  },
  project_chapter: {
    model: "claude-sonnet-4-6",
    maxTokens: 8192,
    wordRange: "800-1200",
    label: "Project Chapter",
  },
  service_overview: {
    model: "claude-sonnet-4-6",
    maxTokens: 12288,
    wordRange: "1200-1800",
    label: "Service Overview",
  },
};

/** Fallback model when no brand DNA exists (rare). */
export const FALLBACK_MODEL = "claude-haiku-4-5-20251001";
export const FALLBACK_MAX_TOKENS = 4096;

export function getModelConfig(type: ContentTypeKey): ModelConfig {
  const cfg = MODEL_CONFIG[type];
  if (!cfg) throw new Error(`Unknown content type: ${type}`);
  return cfg;
}
