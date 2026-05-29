import type { AssembledBlogPrompt } from "./assemble";

/**
 * Provisioning readiness — graded primitives + autopilot verdict.
 *
 * Sits next to block-trace.ts in the inspector pipeline. Where traces
 * answer "where did this block come from?" and the skipped panel
 * answers "why is this block missing?", readiness answers "should we
 * even be generating articles for this subscriber yet?".
 *
 * Design choice: report a small set of NAMED PRIMITIVES (each
 * individually meaningful) and derive a verdict from those, rather
 * than a single arbitrary score. The primitives map directly to
 * onboarding/provisioning actions — each "fail" tells the operator
 * exactly which lever to pull.
 *
 * Calibration: thresholds below are hand-tuned starting points. Tune
 * them against real subscribers spanning sparse → rich. Long-term,
 * graduate to outcome-based tuning (content guard flags, hallucination
 * incidents, engagement on shipped articles).
 */

export type PrimitiveStatus = "pass" | "warn" | "fail";

export interface ReadinessPrimitive {
  key: string;
  label: string;
  /** Current value rendered in the UI ("yes", "3 of 5", "2 assets"). */
  value: string;
  status: PrimitiveStatus;
  /** Desired threshold ("≥ 3 vendor-tagged assets"). */
  target: string;
  /** Why this primitive matters for article quality. */
  diagnostic: string;
  /** What to do in onboarding/provisioning to lift it. */
  onboardingHint: string;
}

export type VerdictLevel = "blocked" | "monitor" | "ready";

export interface ReadinessVerdict {
  level: VerdictLevel;
  headline: string;
  /** Specific primitives that drove this verdict. */
  reasons: string[];
  recommendation: string;
}

export interface ReadinessReport {
  primitives: ReadinessPrimitive[];
  verdict: ReadinessVerdict;
}

/**
 * Compute readiness from an assembled prompt. Pure function — no DB
 * calls; everything needed is already on `assembled.inputs`.
 */
export function assessReadiness(a: AssembledBlogPrompt): ReadinessReport {
  const inputs = a.inputs;

  // Derive counts that aren't already exposed as scalars on `inputs`.
  const voiceSignalCount = [
    inputs.voiceTone,
    inputs.voiceLengthPattern,
    inputs.voiceCasing,
    inputs.voiceEmojiPolicy,
  ].filter(Boolean).length + (inputs.voiceDistinctiveTraitCount > 0 ? 1 : 0);

  const vendorTaggedAssetCount = inputs.assets.filter(
    (asset) => asset.taggedVendors.length > 0,
  ).length;

  const richCaptionCount = inputs.assets.filter(
    (asset) => (asset.contextNote || "").length >= 40,
  ).length;

  const primitives: ReadinessPrimitive[] = [
    {
      key: "playbook",
      label: "Brand playbook",
      value: inputs.playbookPresent ? "yes" : "no",
      status: inputs.playbookPresent ? "pass" : "fail",
      target: "required",
      diagnostic:
        "Without a playbook, the generator falls back from Sonnet to Haiku and the prompt loses brand angle, tone, audience pain phrases, and emotional core.",
      onboardingHint:
        "Run the playbook builder for this site. Brand-positioning + audience-research + offer-core sections must be filled.",
    },
    {
      key: "voice_signals",
      label: "Voice signals populated",
      value: `${voiceSignalCount} of 5`,
      status: voiceSignalCount >= 4 ? "pass" : voiceSignalCount >= 2 ? "warn" : "fail",
      target: "≥ 4 of 5 (tone / length / casing / emoji / distinctive traits)",
      diagnostic:
        "These come from sites.brand_dna.signals.voice — derived by the Brand DNA extractor from real published posts. Sparse signals mean generated articles default to the model's voice instead of mirroring the subscriber's actual cadence.",
      onboardingHint:
        "Wait for the subscriber to publish more content (manually or via TracPost), then re-run the Brand DNA extractor over their post history.",
    },
    {
      key: "vendor_tagged_assets",
      label: "Vendor-tagged assets in pool",
      value: `${vendorTaggedAssetCount} of ${inputs.assets.length}`,
      status: vendorTaggedAssetCount >= 3 ? "pass" : vendorTaggedAssetCount >= 1 ? "warn" : "fail",
      target: "≥ 3 assets with at least one tagged vendor",
      diagnostic:
        "Vendor tags drive the Vendor/Partner Links block AND the auto-classifier's path to vendor_spotlight (via Wikipedia research on those entities). Without vendor coverage, articles cannot link out and the type rotation collapses to deep_dive.",
      onboardingHint:
        "Operator: review media library, tag named brands/vendors on assets via the asset detail page. Long-term: subscriber-facing tagging UI.",
    },
    {
      key: "active_projects",
      label: "Active projects",
      value: `${inputs.projectLinks.length}`,
      status: inputs.projectLinks.length >= 2 ? "pass" : inputs.projectLinks.length >= 1 ? "warn" : "fail",
      target: "≥ 2 projects in projects_v2 with status = 'active'",
      diagnostic:
        "No active projects means the project_story content lane is unavailable, articles cannot cross-link to project pages, and project-narrative cues in captions don't translate to anything renderable.",
      onboardingHint:
        "Provision projects from the operator project tool. Each project needs a hero asset and at least one chapter.",
    },
    {
      key: "rich_captions",
      label: "Rich-caption assets (≥ 40 chars)",
      value: `${richCaptionCount} of ${inputs.assets.length}`,
      status: richCaptionCount >= 3 ? "pass" : richCaptionCount >= 1 ? "warn" : "fail",
      target: "≥ 3 assets with substantive captions",
      diagnostic:
        "Captions feed Wikipedia term extraction (the only LLM call during assembly), the asset metadata blocks, and the project-keyword classifier. Thin captions = sparse research + generic asset blocks + classifier fallthrough to deep_dive.",
      onboardingHint:
        "Coach the subscriber on caption depth at capture time. Each caption should name materials/vendors and describe the moment ('Lacanche Rouge installed in West Shadyside' beats 'kitchen').",
    },
    {
      key: "hook_bank_depth",
      label: "Hook bank depth",
      value: `${inputs.hookBankDepth} hooks`,
      status: inputs.hookBankDepth >= 5 ? "pass" : inputs.hookBankDepth >= 1 ? "warn" : "fail",
      target: "≥ 5 hooks for rotation",
      diagnostic:
        "Hooks are curated opening lines that anchor each article's voice. With zero hooks, the LLM invents an opener every time — generic and inconsistent. With <5, hooks recycle quickly and articles start to sound similar.",
      onboardingHint:
        "Seed the hook bank during onboarding (3-5 hooks minimum). Operator: use the hook editor under /ops. Long-term: extract hooks from the subscriber's own published content.",
    },
    {
      key: "research_yield",
      label: "Wikipedia research yield (this asset)",
      value: inputs.researchChars > 0 ? `${inputs.researchChars} chars` : "empty",
      status: inputs.researchChars > 200 ? "pass" : inputs.researchChars > 0 ? "warn" : "fail",
      target: "> 200 chars to unlock vendor_spotlight classification",
      diagnostic:
        "Per-asset signal — the hero asset's caption produced this much Wikipedia content. > 200 chars triggers vendor_spotlight in the classifier; lower means deep_dive fallthrough. Reflects asset quality, not site readiness — but consistently empty across assets is a tagging/captioning gap.",
      onboardingHint:
        "Try Generate Prompt on a few different assets. If most return empty research, captions need named entities (brands, materials, techniques) the model can recognize.",
    },
    {
      key: "existing_articles",
      label: "Existing v2 articles",
      value: `${inputs.existingTitleCount}`,
      status: inputs.existingTitleCount >= 1 ? "pass" : "warn",
      target: "≥ 1 (uniqueness check active)",
      diagnostic:
        "Fresh-start subscriber. Not a hard fail — articles can ship without prior history — but the no-duplicate-titles guard is inactive on the first article. The classifier will also force authority_overview as the first generation.",
      onboardingHint:
        "Expected for new subscribers. This primitive auto-clears once the first article is generated.",
    },
  ];

  const verdict = computeVerdict(primitives, {
    playbookPresent: inputs.playbookPresent,
    voiceSignalCount,
    vendorTaggedAssetCount,
    activeProjects: inputs.projectLinks.length,
    richCaptionCount,
    researchChars: inputs.researchChars,
    hookBankDepth: inputs.hookBankDepth,
  });

  return { primitives, verdict };
}

interface VerdictInputs {
  playbookPresent: boolean;
  voiceSignalCount: number;
  vendorTaggedAssetCount: number;
  activeProjects: number;
  richCaptionCount: number;
  researchChars: number;
  hookBankDepth: number;
}

function computeVerdict(
  primitives: ReadinessPrimitive[],
  v: VerdictInputs,
): ReadinessVerdict {
  // Hard-block conditions — generating articles for this subscriber would
  // produce thin, generic, or inappropriate copy. Fix these before autopilot.
  const blockReasons: string[] = [];
  if (!v.playbookPresent) {
    blockReasons.push("No brand playbook — articles will fall back to Haiku and miss brand voice entirely.");
  }
  if (v.richCaptionCount < 3) {
    blockReasons.push(`Only ${v.richCaptionCount} rich-caption asset${v.richCaptionCount === 1 ? "" : "s"} (need ≥ 3) — assets aren't substantive enough to carry articles.`);
  }
  if (v.activeProjects === 0 && v.vendorTaggedAssetCount === 0) {
    blockReasons.push("No projects AND no vendor-tagged assets — every article would fall through to deep_dive on a generic asset, killing editorial variety.");
  }

  if (blockReasons.length > 0) {
    return {
      level: "blocked",
      headline: "Not ready for autopilot — fundamentals missing",
      reasons: blockReasons,
      recommendation:
        "Don't run autopilot generation yet. Address each blocker above before flipping the switch. Manual one-off generation is fine for testing.",
    };
  }

  // Ready conditions — every quality lever is up.
  const readyChecks: Array<[boolean, string]> = [
    [v.vendorTaggedAssetCount >= 3, `vendor-tagged assets (${v.vendorTaggedAssetCount}/3)`],
    [v.activeProjects >= 1, `active projects (${v.activeProjects}/1)`],
    [v.voiceSignalCount >= 2, `voice signals (${v.voiceSignalCount}/2)`],
    [v.researchChars > 0, "Wikipedia research yield"],
    [v.hookBankDepth >= 3, `hook bank depth (${v.hookBankDepth}/3)`],
  ];
  const failingReady = readyChecks.filter(([ok]) => !ok).map(([, label]) => label);

  if (failingReady.length === 0) {
    return {
      level: "ready",
      headline: "Ready for autopilot",
      reasons: ["All readiness primitives meet the autopilot threshold."],
      recommendation:
        "Safe to enable autopilot. Continue spot-checking generated articles against the content guard and Brand DNA drift signals.",
    };
  }

  // Between blocked and ready — autopilot can run with operator monitoring.
  return {
    level: "monitor",
    headline: "Autopilot OK with monitoring",
    reasons: [
      `Below ready threshold on: ${failingReady.join(", ")}.`,
      "Hard blockers cleared (playbook present, captions substantive, at least one of projects/vendors covered).",
    ],
    recommendation:
      "Autopilot generation will produce workable articles, but variety and richness will be uneven. Monitor first 5-10 articles before scaling cadence.",
  };
}
