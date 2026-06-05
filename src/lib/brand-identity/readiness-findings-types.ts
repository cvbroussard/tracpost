/**
 * Client-safe type-only exports for ReadinessFinding shape + consolidator
 * output. Lives separately from the consolidator implementation
 * (readiness-findings-consolidator.ts which imports "server-only") so UI
 * components can import the contract without dragging the server-only marker
 * into client bundles. Mirrors the pattern in aesthetic-observation-types.ts.
 *
 * Per [[observation-driven-readiness-audit]] LOCKED 2026-06-04 amended 2026-06-05.
 */

export type FindingSourcePipeline =
  | "cma"
  | "public_presence_observation"
  | "cross_pipeline";

/**
 * Per-finding attribution — the resolution-path axis per
 * [[observation-driven-readiness-audit]]. Three values:
 *
 * - external      — observation surfaces an intentional choice on a single
 *                   owner-controlled surface. Owner has reasons; ask them
 *                   to explain.
 * - inconsistency — observation surfaces a MISMATCH across two surfaces the
 *                   owner controls (logo vs UI, GBP categories vs homepage
 *                   copy, etc.). Owner picks which is canonical.
 * - brand_gap     — signal absent from the brand entirely. System proposes
 *                   direction (Scenario 1) or owner declares.
 *
 * NOTE: a fourth `tracpost_generated` attribution was considered (2026-06-04)
 * and dropped (2026-06-05). The supposed "silent-self-heal" path it implied
 * was illusory — regenerating a site with the same generator just reproduces
 * the drift. The real architectural commitment lives at
 * [[website-generator-brand-identity-overhaul]]: brand-identity readiness
 * precedes website generation; the generator must consume canonical
 * declared. TracPost-built sites and third-party sites get identical
 * treatment by readiness findings — both are publicly observable surfaces.
 */
export type FindingAttribution =
  | "external"
  | "inconsistency"
  | "brand_gap";

export type FindingSeverity = "blocking" | "refinement" | "informational";

export interface ReadinessFinding {
  /** Stable identifier within a consolidation run. */
  id: string;
  /** Direct factual observation — what was seen, agency-analyst voice. */
  observation: string;
  /** Provenance — quotes from the source, asset references, specific visual elements. */
  evidence: string[];
  source_pipeline: FindingSourcePipeline;
  attribution: FindingAttribution;
  severity: FindingSeverity;
  /** Owner-facing wording, voice-templated by attribution. The "explain this" question. */
  prompt_text: string;
  /** Optional concrete recommended action. May be null when the prompt is purely diagnostic. */
  recommended_action?: string | null;
  /** Which descriptor this finding pertains to (if any). domain.key form, or null for cross-cutting findings. */
  descriptor_key?: string | null;
}

export interface ReadinessFindingsPayload {
  findings: ReadinessFinding[];
  meta: {
    source_substrate_id: string;
    source_substrate_kind: "public_presence_observation";
    generated_at: string;
    model_for_prompt_text: string;
    prompt_version: string;
    counts: {
      total: number;
      by_severity: Record<FindingSeverity, number>;
      by_attribution: Record<FindingAttribution, number>;
    };
  };
}
