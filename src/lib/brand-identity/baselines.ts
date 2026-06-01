/**
 * Industry-baseline term sets for GUARDRAIL descriptors (`avoid`, `do_not_show`,
 * etc.). Carry zero differentiation cost — applies our locked principle that
 * industry-default VALUES are fine ONLY on guardrails (never on differentiators
 * like positioning/offer/audience).
 *
 * UX shape: rendered as a checkbox list on the descriptor card; default ALL
 * CHECKED. The owner unchecks what doesn't apply. Persisted under
 * brand_descriptor.metadata.baselinesApplied (inclusion semantics — list contains
 * what's CHECKED; null/missing = all applicable default-on). Read path merges
 * baselines live so updates propagate without re-dumping text into declared.
 *
 * `allowed[]` is the "use instead" suggestion list for text-shaped baselines
 * (avoid). Shown in coaching beside the forbidden terms AND used by the inline
 * forbidden-term detection on declared text fields.
 *
 * Pure data, client-safe — the page imports this directly.
 */

export interface BaselineSet {
  /** Stable id persisted in baselinesApplied lists. Never rename. */
  id: string;
  label: string;
  /** Descriptor keys this baseline can apply to. */
  applicableTo: string[];
  /** Why these terms are flagged — generalizes the pattern for extraction. */
  reason: string;
  /** Terms (words for text-shaped baselines like `avoid`; visual rules for `do_not_show`). */
  terms: string[];
  /**
   * "Use instead" alternatives shown next to the forbidden terms and surfaced
   * in inline detection warnings. Mostly only set for text-shaped baselines —
   * the concept doesn't map cleanly to visual baselines.
   */
  allowed?: string[];
}

export const BASELINE_SETS: readonly BaselineSet[] = [
  // ── avoid (text/word baselines) ────────────────────────────────────────────
  {
    id: "hgtv_realtor_cliches",
    label: "HGTV / realtor cliches",
    applicableTo: ["avoid"],
    reason: "Cheapens craft; generic-listing voice",
    terms: [
      "transform",
      "turnkey",
      "elevate",
      "stunning",
      "luxury",
      "premium",
      "high-end",
      "dream home",
      "breathtaking",
      "showstopper",
    ],
    allowed: [
      "refined",
      "considered",
      "elevated craft",
      "of-its-period",
      "exacting",
      "well-resolved",
      "remarkable",
    ],
  },
  {
    id: "hyperbolic_claims",
    label: "Hyperbolic claims",
    applicableTo: ["avoid"],
    reason: "Unfounded; credibility and legal risk",
    terms: [
      "best",
      "perfect",
      "guaranteed",
      "always",
      "never",
      "everyone",
      "100%",
      "world-class",
    ],
    allowed: [
      "among the strongest",
      "well-suited",
      "carefully executed",
      "consistently",
      "rarely",
      "most clients",
      "in our experience",
    ],
  },
  {
    id: "greenwashing",
    label: "Greenwashing",
    applicableTo: ["avoid"],
    reason: "Unsubstantiated environmental claims",
    terms: ["eco-friendly", "sustainable", "green", "natural", "earth-friendly"],
    allowed: [
      "low-VOC",
      "responsibly sourced",
      "long-lived",
      "[specific certification you actually hold]",
    ],
  },

  // ── do_not_show (visual baselines) ─────────────────────────────────────────
  {
    id: "safety_ppe_violations",
    label: "Safety / PPE violations",
    applicableTo: ["do_not_show"],
    reason: "Safety compliance + unprofessional crew impression",
    terms: [
      "crew without hard hats or PPE",
      "unsafe ladder use",
      "working at height without fall protection",
      "tools used unsafely",
      "exposed live electrical work",
    ],
  },
  {
    id: "generic_stock_imagery",
    label: "Generic / stock imagery",
    applicableTo: ["do_not_show"],
    reason: "Erodes authenticity and craft positioning",
    terms: [
      "stock-photo crews",
      "posed handshake shots",
      "generic suburban settings",
      "reality-TV before/after composition",
      "AI-generated subjects",
    ],
  },
  {
    id: "competitor_presence",
    label: "Competitor presence",
    applicableTo: ["do_not_show"],
    reason: "Promotes others; dilutes brand frame",
    terms: [
      "competitor branded vehicles",
      "competitor signage in frame",
      "competitor branded tools",
      "competitor staff",
    ],
  },
  {
    id: "privacy_consent_risks",
    label: "Privacy / consent risks",
    applicableTo: ["do_not_show"],
    reason: "Legal and privacy exposure",
    terms: [
      "faces of children without parental consent",
      "identifying client documents in frame",
      "client home interiors without permission",
      "readable license plates",
    ],
  },
] as const;

export function baselinesFor(descriptorKey: string): BaselineSet[] {
  return BASELINE_SETS.filter((b) => b.applicableTo.includes(descriptorKey));
}

export function getBaseline(id: string): BaselineSet | undefined {
  return BASELINE_SETS.find((b) => b.id === id);
}

// ── Forbidden-term detection (for inline coaching on declared text fields) ───

export interface ForbiddenTerm {
  term: string;
  baselineLabel: string;
  allowed: string[];
}

/**
 * Compute the forbidden-term list from the `avoid` descriptor's currently-
 * applied baselines. The page passes this to every text-capable descriptor
 * card (except `avoid` itself — where forbidden terms legitimately appear) so
 * inline detection can warn the owner when they're contradicting their own
 * guardrail in prose.
 */
export function forbiddenTermsFromAvoid(
  avoidBaselinesApplied: string[] | undefined,
): ForbiddenTerm[] {
  const applicable = baselinesFor("avoid");
  const appliedIds = avoidBaselinesApplied ?? applicable.map((b) => b.id);
  return applicable
    .filter((b) => appliedIds.includes(b.id))
    .flatMap((b) =>
      b.terms.map((term) => ({
        term,
        baselineLabel: b.label,
        allowed: b.allowed ?? [],
      })),
    );
}

/** Word-boundary, case-insensitive scan of `text` for any forbidden term. */
export function detectForbidden(
  text: string,
  forbidden: ForbiddenTerm[],
): ForbiddenTerm[] {
  if (!text) return [];
  return forbidden.filter((f) => {
    const escaped = f.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(text);
  });
}
