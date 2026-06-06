/**
 * Weasel-words taxonomy — platform-wide curated list for the `avoid`
 * descriptor's bool_toggle_overrides input.
 *
 * Per [[verbal-domain-decomposition]] LOCKED 2026-06-03: this is the ONE
 * master list of marketing-speak the platform flags. Owner controls via
 * `avoid.declared.weasel_words_applies` (toggle, default true) +
 * `avoid.declared.weasel_words_allow_overrides` (per-term exceptions). NO
 * owner contribution to the list itself — that's a platform/policy
 * decision (feedback channel only).
 *
 * SUPERSEDES the per-set baselines pattern (baselines.ts) for `avoid`
 * specifically. The 3 existing avoid baselines (hgtv_realtor_cliches,
 * hyperbolic_claims, greenwashing) are folded into this taxonomy as
 * category-level groupings. baselines.ts continues to drive `do_not_show`
 * (visual guardrails) and any future opt-out-style descriptors.
 *
 * Annually refreshed. Additive only — adding new terms is safe; removing
 * is owner-visible drift. If a term must come off, sweep allow_overrides
 * lists across brands to confirm none rely on it.
 *
 * Client-safe (no server imports); read by the avoid UI directly + by
 * forbidden-term detection in the form layer.
 */

export interface WeaselWordCategory {
  /** Stable snake_case key — never rename. Used in any per-category persistence. */
  key: string;
  label: string;
  /** One-sentence guidance on what this category catches. */
  description: string;
  terms: string[];
  /**
   * Optional "use instead" alternatives shown next to flagged terms +
   * surfaced in coaching warnings. Set per-category when meaningful
   * alternatives exist.
   */
  allowed?: string[];
}

export const WEASEL_WORD_CATEGORIES: readonly WeaselWordCategory[] = [
  {
    key: "vague_qualifiers",
    label: "Vague qualifiers",
    description: "Words that sound meaningful but make no specific claim.",
    terms: [
      "top",
      "top-rated",
      "leading",
      "premier",
      "world-class",
      "premium",
      "high-end",
      "luxury",
      "finest",
      "elite",
      "superior",
      "best-in-class",
      "industry-leading",
    ],
    allowed: [
      "named-specifically",
      "evidenced",
      "credentialed",
      "ranked Nth (with source)",
      "specialist in",
    ],
  },
  {
    key: "unspecified_attribution",
    label: "Unspecified attribution",
    description: "Claims with no actual source behind them.",
    terms: [
      "experts agree",
      "studies show",
      "research proves",
      "proven",
      "voted #1",
      "award-winning",
      "trusted by thousands",
      "as featured in",
    ],
    allowed: [
      "<source> rated us...",
      "<N> reviews on <platform>",
      "named <award> by <body> in <year>",
    ],
  },
  {
    key: "subjective_puffery",
    label: "Subjective puffery",
    description: "Opinion stated as fact with no concrete referent.",
    terms: [
      "amazing",
      "exceptional",
      "outstanding",
      "remarkable",
      "extraordinary",
      "incredible",
      "spectacular",
      "breathtaking",
      "stunning",
      "showstopper",
    ],
    allowed: [
      "well-resolved",
      "refined",
      "carefully executed",
      "considered",
      "exacting",
    ],
  },
  {
    key: "implied_superiority",
    label: "Implied superiority",
    description: "Comparative claims with no actual comparator.",
    terms: [
      "better than ever",
      "like no other",
      "unmatched",
      "second to none",
      "unparalleled",
      "in a league of their own",
      "one-of-a-kind",
    ],
    allowed: [
      "differentiated by <X>",
      "the only <category> that <specific>",
      "unlike <named competitor>",
    ],
  },
  {
    key: "hyperbole",
    label: "Hyperbole",
    description: "Over-the-top language that promises transformation.",
    terms: [
      "revolutionary",
      "game-changing",
      "life-changing",
      "transformative",
      "transform",
      "groundbreaking",
      "breakthrough",
      "elevate",
      "turnkey",
      "dream home",
    ],
    allowed: [
      "rebuilt",
      "redesigned",
      "reworked",
      "delivered <specific change>",
    ],
  },
  {
    key: "soft_hedges",
    label: "Soft hedges",
    description: "Commitment-avoidance language that weakens claims.",
    terms: [
      "might",
      "could",
      "may",
      "possibly",
      "potentially",
      "somewhat",
      "typically",
      "usually",
      "generally",
      "often",
    ],
    allowed: [
      "always (when verifiable)",
      "consistently",
      "in <N>+ projects",
      "since <year>",
    ],
  },
  {
    key: "sloppy_promise_language",
    label: "Sloppy promise language",
    description: "Vague commitments that can't be verified or refunded.",
    terms: [
      "top notch",
      "top-notch",
      "high quality",
      "high-quality",
      "great service",
      "satisfaction guaranteed",
      "100% satisfaction",
      "100% guaranteed",
      "always reliable",
    ],
    allowed: [
      "warranted <duration>",
      "money-back within <window>",
      "we'll <specific action> if <specific condition>",
    ],
  },
  {
    key: "absolute_claims",
    label: "Absolute claims",
    description: "Universals that invite legal and credibility risk.",
    terms: [
      "best",
      "#1",
      "perfect",
      "guaranteed",
      "always",
      "never",
      "everyone",
      "100%",
      "no one else",
    ],
    allowed: [
      "among the strongest",
      "in our experience",
      "in <N> cases out of <M>",
      "no client to date",
    ],
  },
  {
    key: "scam_adjacent",
    label: "Scam-adjacent promise",
    description: "Phrases that pattern-match to spam, pyramid, or scam copy.",
    terms: [
      "secret method",
      "get rich quick",
      "magic formula",
      "one weird trick",
      "exclusive deal",
      "limited spots",
      "insider only",
    ],
    allowed: [],
  },
  {
    key: "promotional_gimmickry",
    label: "Promotional gimmickry",
    description: "Cheesy marketing flourishes that read as low-trust copy.",
    terms: [
      "act now",
      "don't miss out",
      "once in a lifetime",
      "this is your chance",
      "unbelievable savings",
      "you won't believe",
      "blow your mind",
    ],
    allowed: [],
  },
  {
    key: "manufactured_urgency",
    label: "Manufactured urgency",
    description: "Artificial scarcity / time pressure.",
    terms: [
      "last chance",
      "ending soon",
      "while supplies last",
      "hurry",
      "expires today",
      "only 24 hours left",
      "today only",
      "now or never",
    ],
    allowed: [
      "open through <date>",
      "limited to <N> per <period>",
      "next availability <date>",
    ],
  },
  {
    key: "pressure_tactics",
    label: "Pressure tactics",
    description: "Coercive language that nudges through guilt or fear.",
    terms: [
      "you'd be crazy not to",
      "can you afford not to",
      "everyone is doing it",
      "don't be left behind",
      "this won't be available again",
      "you'll regret it",
    ],
    allowed: [],
  },
  {
    key: "greenwashing",
    label: "Greenwashing",
    description: "Unsubstantiated environmental / ethical claims.",
    terms: [
      "eco-friendly",
      "sustainable",
      "green",
      "natural",
      "earth-friendly",
      "all-natural",
      "carbon-neutral (unverified)",
    ],
    allowed: [
      "low-VOC",
      "responsibly sourced",
      "<certification> certified",
      "<specific material> recycled",
      "<measured> reduction in <metric>",
    ],
  },
];

/**
 * Effective term list for a brand — full taxonomy minus allow-list overrides.
 * The forbidden-term detection in the form layer reads this when an owner has
 * `weasel_words_applies: true`.
 */
export function effectiveWeaselWords(allowOverrides: string[]): {
  term: string;
  category: WeaselWordCategory;
}[] {
  const overridesLower = new Set(
    allowOverrides.map((o) => o.toLowerCase().trim()).filter((s) => s.length > 0),
  );
  const out: { term: string; category: WeaselWordCategory }[] = [];
  for (const cat of WEASEL_WORD_CATEGORIES) {
    for (const term of cat.terms) {
      if (!overridesLower.has(term.toLowerCase())) {
        out.push({ term, category: cat });
      }
    }
  }
  return out;
}

/** Total count of terms in the master taxonomy (excluding overrides). */
export function totalWeaselWordsCount(): number {
  let n = 0;
  for (const c of WEASEL_WORD_CATEGORIES) n += c.terms.length;
  return n;
}

/**
 * Forbidden-term shape used by the page-level inline-coaching detection.
 * Mirrors baselines.ts's ForbiddenTerm so the page can pass a unified array
 * to detectForbidden() regardless of source pipeline.
 */
export interface WeaselForbiddenTerm {
  term: string;
  baselineLabel: string;
  allowed: string[];
}

/**
 * Compute the forbidden-term list from the avoid descriptor's new declared
 * shape (post-2026-06-06 weasel-words decomposition). Inverse of the legacy
 * baselines opt-out semantics: if the toggle is OFF, no terms are flagged;
 * if ON, all categories contribute their terms minus the per-term allow-list
 * overrides.
 *
 * Mirrors the contract of forbiddenTermsFromAvoid() in baselines.ts so the
 * page can swap or merge sources without changing detectForbidden() callers.
 */
export function forbiddenTermsFromWeaselWords(declared: {
  weasel_words_applies?: boolean;
  weasel_words_allow_overrides?: string[];
} | null | undefined): WeaselForbiddenTerm[] {
  if (!declared) return [];
  // Default ON if the flag is missing (matches the toggle's default-true)
  if (declared.weasel_words_applies === false) return [];
  const overrides = Array.isArray(declared.weasel_words_allow_overrides)
    ? declared.weasel_words_allow_overrides
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.toLowerCase().trim())
    : [];
  const overrideSet = new Set(overrides);
  const out: WeaselForbiddenTerm[] = [];
  for (const cat of WEASEL_WORD_CATEGORIES) {
    for (const term of cat.terms) {
      if (overrideSet.has(term.toLowerCase())) continue;
      out.push({
        term,
        baselineLabel: cat.label,
        allowed: cat.allowed ?? [],
      });
    }
  }
  return out;
}
