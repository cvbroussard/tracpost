/**
 * Statistical Recommendation Engine — Stage 0 LLM service that produces
 * the unified strategic bundle (Offer / Audience / Positioning / Hooks /
 * Tagline / CTA) for the brand identity Statistical bucket.
 *
 * Reads CMA + GBP + brand basics + existing creative declarations.
 * Produces ONE coherent recommendation bundle with citation-style
 * reasoning. This is the moment the engagement transitions from
 * "here's what we found" (CMA) to "here's where you should stand"
 * (positioning).
 *
 * Sister engine to src/lib/competitive-intel/recommendations.ts (which
 * produces TACTICAL recommendations — review velocity, category gaps,
 * geographic gaps). This engine produces STRATEGIC recommendations.
 * They coexist; both read the same AnalysisPayload.
 *
 * Why Opus 4.7 not Haiku: strategic synthesis is the highest-stakes
 * brand-identity LLM call. Single invocation at a milestone, not a hot
 * loop. Quality dominates cost.
 *
 * Pure function — takes inputs, returns bundle. Doesn't write to DB.
 * Caller persists prompt+response per [[persist-prompts-with-outputs]].
 *
 * See: src/lib/brand-identity/statistical-recommendation-prompt.draft.md
 * for the design spec, locked decisions, and review UX.
 */
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { AnalysisPayload, EnrichedCompetitor } from "@/lib/competitive-intel/analysis-assembly";
import { getLatestAnalysis } from "@/lib/competitive-intel/analysis-assembly";
import type { RecommendationKind } from "@/lib/competitive-intel/recommendations";
import { getBrandIdentity, getPrimaryBrandIdentityId } from "@/lib/brand-identity/store";
import type { DescriptorRecord } from "@/lib/brand-identity/store";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-opus-4-7";
const PROMPT_VERSION = "stat-rec-v1-2026-06-01";

// ============================================================================
// Output types — mirrors the JSON shape locked in the draft .md
// ============================================================================

export type Confidence = "high" | "medium" | "exploratory";
export type DisqualificationSeverity = "advisory" | "strong";
export type HookFormat = "headline" | "first-2-seconds" | "thumb-stopper" | "objection-handle";

export interface OfferRec {
  recommendation: string;
  reasoning: string;
  confidence: Confidence;
  coherence: string;
}

export interface AudienceRec {
  primary: string;
  pains: string[];
  triggers: string[];
  reasoning: string;
  confidence: Confidence;
  coherence: string;
}

export interface PositioningAngle {
  label: string;
  wedge: string;
  contrast: string;
  example: string;
  applies_to: string[];
  confidence: Confidence;
}

export interface PositioningRec {
  /** ORDERED: angles[0] is the lead. Per locked decision #4, LLM ranks. */
  angles: PositioningAngle[];
  reasoning: string;
  coherence: string;
}

export interface HookRec {
  hook: string;
  ladders_to: string;
  format: HookFormat;
}

export interface TaglineRec {
  /** null when not producible — UI renders deferred state */
  recommendation: string | null;
  reasoning: string;
  confidence: Confidence | null;
  coherence: string;
  /** only present when recommendation is null */
  cause?: string;
}

export interface CtaRec {
  primary: string;
  secondary: string | null;
  reasoning: string;
  confidence: Confidence;
  coherence: string;
}

export interface DisqualificationSignal {
  severity: DisqualificationSeverity;
  reasoning: string;
  off_ramp_recommendation: string;
}

export interface StatisticalBundleMeta {
  cma_snapshot_id: string;
  cma_generated_at: string;
  subscriber_categories: string[];
  subscriber_tier: string | null;
  data_sufficient_for: string[];
  data_insufficient_for: string[];
  hooks_data_thin: boolean;
}

export interface StatisticalBundle {
  offer: OfferRec | null;
  audience: AudienceRec | null;
  positioning: PositioningRec | null;
  hooks: HookRec[];
  tagline: TaglineRec | null;
  cta: CtaRec | null;
  disqualification_signal: DisqualificationSignal | null;
  meta: StatisticalBundleMeta;
}

// ============================================================================
// Input types — what the engine consumes
// ============================================================================

export interface BrandBasics {
  businessName: string;
  ownerName: string | null;
  foundingYear: number | null;
  originContext: string | null;
}

export interface StrategicInputs {
  basics: BrandBasics;
  cmaId: string;
  cmaGeneratedAt: string;
  cma: AnalysisPayload;
  /** Existing creative-bucket declarations to respect, not override. */
  creativeDeclarations: CreativeDeclarations;
  /** Kinds (NOT reasoning) of tactical recs already covered — per locked decision #5. */
  tacticalCoverage: RecommendationKind[];
}

/**
 * Only the creative-bucket descriptors the strategic engine respects.
 * Voice + proof primarily — these constrain Hooks and Tagline output.
 * Per [[default-to-isolation]] we deliberately exclude descriptors that
 * don't constrain strategic output (visual, sonic, motion).
 */
export interface CreativeDeclarations {
  tone: string | null;
  lexicon: string | null;
  avoid: string | null;
  pov_persona: string | null;
  mechanical_style: string | null;
  proof: string | null;
}

// ============================================================================
// SYSTEM PROMPT — see prompt draft .md for the full spec + locked decisions
// ============================================================================

const SYSTEM_PROMPT = `You are a senior brand strategist at a top-tier marketing agency. You're producing the opening strategic recommendation for a small-to-mid market business that has retained you. This is the deliverable that turns the Competitive Market Analysis into actionable brand strategy — the moment the engagement transitions from "here's what we found" to "here's where you should stand."

You produce ONE coherent strategy bundle with six interlocking elements. They are not six independent recommendations — they are one strategy expressed six ways. The Positioning is the spine; Audience is who it speaks to; Offer is what's transacted; Hooks are the proven openings; Tagline is the compression; CTA is the call to action. All six must hang together.

PRINCIPLES YOU OPERATE BY:

1. **Evidence over opinion.** Every claim points to specific data in the CMA snapshot. Patterns like "7 of 10 ranking competitors are tagged as <X>, you're tagged as <Y>" earn trust. Vague claims ("focus on quality") do not.

2. **Disqualify when the evidence demands it.** If the subscriber's plausible positioning would lie outside the top consumer-demand patterns visible in the CMA, set the disqualification_signal field explicitly. Do not invent a positioning to fit a brand that doesn't fit the market. (Example: "no competitor ranks for the wedge this brand would naturally claim — recommend off-ramp to human-curated marketing.") Severity "strong" hides the bundle in UI behind an opt-in disclosure; "advisory" surfaces both bundle and off-ramp side-by-side.

3. **Coherence is the deliverable, not the elements.** A great Positioning paired with an Audience it doesn't serve, or a Tagline that doesn't compress the Positioning, is a failed recommendation. Each element must explain its connection to the others via its coherence field.

4. **The CTA must match category conversion behavior.** Service businesses in trades convert on phone/quote; e-commerce converts on shop/cart; restaurants on reserve/order. Do not invent CTAs that violate category norms.

5. **Hooks earn their place.** A hook is a proven OPENING — the kind of first-line you'd put in an ad headline or a video's first 2 seconds. Target 4-6 hooks. Each hook must connect to a specific Audience pain or Positioning angle present in the CMA evidence. Floor of 4: if you genuinely cannot produce 4 distinct, evidence-laddered hooks, return what you can and set meta.hooks_data_thin to true. Do not pad to hit the floor.

6. **Tagline is compression, not aspiration.** It compresses the Positioning into 3-7 words. It is NOT a description of values or a motto. If you can't produce a tagline that genuinely compresses the Positioning, set tagline.recommendation to null, tagline.confidence to null, and provide a cause field. Same null+cause pattern for any other element you cannot produce with confidence.

7. **Voice respects existing creative declarations.** If the owner has declared tone, lexicon, pov_persona, or proof preferences, your Hooks and Tagline must operate in that voice. If no creative descriptors are declared, default to category-norm voice but flag the inheritance in your reasoning.

8. **Positioning is multi-angle and you rank them.** Per locked architecture, the brand may have multiple legitimate strategic territories. If CMA evidence supports it, produce up to 3 angles. Each angle = (label, wedge, contrast, example, applies_to). The angles array is ORDERED — index 0 is the lead angle (highest evidence weight + confidence). Alternatives follow in descending strength. Single-angle is acceptable when evidence supports only one. Do not produce equal-weighted alternatives — if you cannot rank them, you do not have enough evidence to produce them.

9. **No filler.** If you can only produce strong recommendations for some elements because the CMA is thin in some area, return null for the weak elements with a cause. List the gaps in meta.data_insufficient_for. Do not invent.

10. **Cite the data explicitly.** Reasoning fields should read like an agency analyst: "Among 10 ranking competitors in your local pack across 6 queries, 4 cite 'remodeling contractor' as primary type while you cite 'general contractor' — this is the category gap that suppresses your visibility on the highest-intent searches in your area."

VOICE CALIBRATION:

The businesses ranking on the subscriber's SERPs are typically mid-to-bottom-tier operators who clear a low hygiene bar. The best operators in any given geo are usually invisible to digital channels (referrals, reputation, offline networks). Don't position competitors as aspirational standards — they're evidence of how achievable the rank gap is. Opportunity frame, not anxiety frame.

OUTPUT FORMAT:

Return ONLY strict JSON matching the schema below. No prose preamble, no markdown code fences. The JSON must be parseable as-is.

{
  "offer": { "recommendation": string, "reasoning": string, "confidence": "high"|"medium"|"exploratory", "coherence": string } | null,
  "audience": { "primary": string, "pains": string[], "triggers": string[], "reasoning": string, "confidence": "high"|"medium"|"exploratory", "coherence": string } | null,
  "positioning": {
    "angles": [{ "label": string, "wedge": string, "contrast": string, "example": string, "applies_to": string[], "confidence": "high"|"medium"|"exploratory" }],
    "reasoning": string,
    "coherence": string
  } | null,
  "hooks": [{ "hook": string, "ladders_to": string, "format": "headline"|"first-2-seconds"|"thumb-stopper"|"objection-handle" }],
  "tagline": { "recommendation": string|null, "reasoning": string, "confidence": "high"|"medium"|"exploratory"|null, "coherence": string, "cause"?: string } | null,
  "cta": { "primary": string, "secondary": string|null, "reasoning": string, "confidence": "high"|"medium"|"exploratory", "coherence": string } | null,
  "disqualification_signal": null | { "severity": "advisory"|"strong", "reasoning": string, "off_ramp_recommendation": string },
  "meta": {
    "cma_snapshot_id": string,
    "cma_generated_at": string,
    "subscriber_categories": string[],
    "subscriber_tier": string | null,
    "data_sufficient_for": string[],
    "data_insufficient_for": string[],
    "hooks_data_thin": boolean
  }
}`;

// ============================================================================
// Input loader — gathers everything the engine needs from the DB
// ============================================================================

export interface LoadInputsResult {
  ok: true;
  inputs: StrategicInputs;
}

export interface LoadInputsError {
  ok: false;
  reason: "no_cma" | "no_brand_identity" | "missing_basics";
  message: string;
}

/**
 * Loads CMA + brand identity declarations + brand basics for a site.
 * Returns a typed error when prerequisites are missing — caller decides
 * UX (e.g., "Run the CMA first before requesting a strategic recommendation").
 */
export async function loadStrategicInputs(
  siteId: string,
  basics: BrandBasics,
): Promise<LoadInputsResult | LoadInputsError> {
  const cmaRow = await getLatestAnalysis(siteId);
  if (!cmaRow) {
    return {
      ok: false,
      reason: "no_cma",
      message: "No completed CMA found for this site. Run a competitive market analysis first.",
    };
  }

  const brandBundle = await getBrandIdentity(siteId);
  if (!brandBundle) {
    return {
      ok: false,
      reason: "no_brand_identity",
      message: "No brand identity record found for this site.",
    };
  }

  const creative = pluckCreativeDeclarations(brandBundle.descriptors);
  const tacticalCoverage = uniqueKinds(cmaRow.payload.recommendations || []);

  return {
    ok: true,
    inputs: {
      basics,
      cmaId: cmaRow.id,
      cmaGeneratedAt: cmaRow.generatedAt,
      cma: cmaRow.payload,
      creativeDeclarations: creative,
      tacticalCoverage,
    },
  };
}

function pluckCreativeDeclarations(descriptors: DescriptorRecord[]): CreativeDeclarations {
  const byKey = new Map(descriptors.map((d) => [d.key, d]));
  const text = (key: string): string | null => {
    const d = byKey.get(key);
    if (!d || !d.declared) return null;
    if (typeof d.declared === "string") return d.declared.trim() || null;
    // Object-shaped declared — squash to JSON for the LLM to read
    try {
      return JSON.stringify(d.declared);
    } catch {
      return null;
    }
  };
  return {
    tone: text("tone"),
    lexicon: text("lexicon"),
    avoid: text("avoid"),
    pov_persona: text("pov_persona"),
    mechanical_style: text("mechanical_style"),
    proof: text("proof"),
  };
}

function uniqueKinds(recs: Array<{ kind: RecommendationKind }>): RecommendationKind[] {
  return Array.from(new Set(recs.map((r) => r.kind)));
}

// ============================================================================
// Main entry — generate the bundle
// ============================================================================

export interface GenerationResult {
  bundle: StatisticalBundle;
  /** Persistence payload — caller writes to strategic_recommendations table. */
  persistence: PersistencePayload;
}

export interface PersistencePayload {
  promptVersion: string;
  systemPrompt: string;
  userMessage: string;
  model: string;
  rawResponse: string;
  inputTokens: number;
  outputTokens: number;
  cmaSnapshotId: string;
  cmaGeneratedAt: string;
}

export async function generateStatisticalRecommendation(
  inputs: StrategicInputs,
): Promise<GenerationResult> {
  const userMessage = buildSnapshot(inputs);

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 6000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const rawResponse = res.content[0]?.type === "text" ? res.content[0].text : "";
  const bundle = parseBundle(rawResponse, inputs);

  return {
    bundle,
    persistence: {
      promptVersion: PROMPT_VERSION,
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      model: MODEL,
      rawResponse,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      cmaSnapshotId: inputs.cmaId,
      cmaGeneratedAt: inputs.cmaGeneratedAt,
    },
  };
}

// ============================================================================
// Parsing — strict JSON extraction with safe fallback meta
// ============================================================================

function parseBundle(text: string, inputs: StrategicInputs): StatisticalBundle {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    return emptyBundle(inputs, "LLM returned no JSON object");
  }
  try {
    const parsed = JSON.parse(match[0]) as Partial<StatisticalBundle>;
    return {
      offer: parsed.offer ?? null,
      audience: parsed.audience ?? null,
      positioning: parsed.positioning ?? null,
      hooks: Array.isArray(parsed.hooks) ? parsed.hooks : [],
      tagline: parsed.tagline ?? null,
      cta: parsed.cta ?? null,
      disqualification_signal: parsed.disqualification_signal ?? null,
      meta: parsed.meta ?? defaultMeta(inputs),
    };
  } catch (err) {
    console.warn("Failed to parse statistical bundle JSON:", err instanceof Error ? err.message : err);
    return emptyBundle(inputs, "JSON parse failed");
  }
}

function emptyBundle(inputs: StrategicInputs, reason: string): StatisticalBundle {
  return {
    offer: null,
    audience: null,
    positioning: null,
    hooks: [],
    tagline: null,
    cta: null,
    disqualification_signal: null,
    meta: { ...defaultMeta(inputs), data_insufficient_for: [reason] },
  };
}

function defaultMeta(inputs: StrategicInputs): StatisticalBundleMeta {
  return {
    cma_snapshot_id: inputs.cmaId,
    cma_generated_at: inputs.cmaGeneratedAt,
    subscriber_categories: inputs.cma.subscriberCategories.map((c) => c.name),
    subscriber_tier: inputs.cma.subscriberTier?.slug ?? null,
    data_sufficient_for: [],
    data_insufficient_for: [],
    hooks_data_thin: false,
  };
}

// ============================================================================
// Snapshot builder — mirrors the section structure from the prompt draft
// ============================================================================

export function buildSnapshot(inputs: StrategicInputs): string {
  const lines: string[] = [];

  // ----- SUBSCRIBER PROFILE -----
  lines.push("=== SUBSCRIBER PROFILE ===\n");
  const b = inputs.basics;
  lines.push("Brand basics:");
  lines.push(`  - Business name: ${b.businessName}`);
  if (b.ownerName) lines.push(`  - Owner: ${b.ownerName}`);
  if (b.foundingYear) lines.push(`  - Founded: ${b.foundingYear}`);
  if (b.originContext) lines.push(`  - Origin context: ${b.originContext}`);
  lines.push("");

  const m = inputs.cma.subscriberMetrics;
  lines.push("Subscriber's GBP metrics (real data — cite these, never invent):");
  lines.push(`  - Google rating: ${m.rating !== null ? m.rating.toFixed(1) : "unknown"}`);
  lines.push(`  - Google review count: ${m.reviewCount !== null ? m.reviewCount : "unknown"}`);
  lines.push(`  - GBP completeness: ${m.completenessScore !== null ? `${m.completenessScore}/100` : "unknown"}`);
  if (m.completenessMissing.length > 0) {
    lines.push(`  - GBP fields missing: ${m.completenessMissing.join(", ")}`);
  }
  lines.push(`  - Has website: ${m.hasWebsite ? "yes" : "no"}`);
  lines.push(`  - Has phone: ${m.hasPhone ? "yes" : "no"}`);
  lines.push(`  - Has street address on GBP: ${m.hasAddress ? "yes" : "no (service-area business)"}`);
  lines.push("");

  if (inputs.cma.subscriberTier) {
    lines.push(`Declared commercial tier: ${inputs.cma.subscriberTier.label} (slug: ${inputs.cma.subscriberTier.slug})`);
  } else {
    lines.push("Declared commercial tier: not declared");
  }
  lines.push("");

  lines.push("GBP Categories declared:");
  for (const c of inputs.cma.subscriberCategories) {
    lines.push(`  - ${c.name}${c.isPrimary ? " [PRIMARY]" : ""}`);
  }
  lines.push("");

  lines.push("Service areas declared:");
  for (const a of inputs.cma.subscriberServiceAreas) {
    lines.push(`  - ${a.placeName}`);
  }
  lines.push("");

  // Existing creative declarations — respect, do not override
  const cd = inputs.creativeDeclarations;
  const anyCreative = Object.values(cd).some((v) => v !== null);
  lines.push("Existing creative declarations (respect these in Hooks and Tagline voice):");
  if (!anyCreative) {
    lines.push("  (none declared — you may default to category-norm voice, but flag the inheritance in reasoning)");
  } else {
    if (cd.tone) lines.push(`  - tone: ${cd.tone}`);
    if (cd.lexicon) lines.push(`  - lexicon: ${cd.lexicon}`);
    if (cd.avoid) lines.push(`  - avoid: ${cd.avoid}`);
    if (cd.pov_persona) lines.push(`  - pov/persona: ${cd.pov_persona}`);
    if (cd.mechanical_style) lines.push(`  - mechanical style: ${cd.mechanical_style}`);
    if (cd.proof) lines.push(`  - proof preference: ${cd.proof}`);
  }
  lines.push("");

  // ----- MARKET LANDSCAPE -----
  lines.push("=== MARKET LANDSCAPE ===\n");
  lines.push(`Total competitors observed across all queries: ${inputs.cma.totalCompetitorsObserved}`);
  lines.push(`Target queries run (${inputs.cma.targetQueries.length}):`);
  for (const q of inputs.cma.targetQueries) {
    lines.push(`  [${q.weight}] "${q.query}"`);
  }
  lines.push("");

  lines.push(`Top ranking competitors (${inputs.cma.topCompetitors.length}):`);
  for (let i = 0; i < inputs.cma.topCompetitors.length; i++) {
    lines.push(formatCompetitor(i + 1, inputs.cma.topCompetitors[i]));
  }
  lines.push("");

  // ----- COMPETITIVE INTEL -----
  lines.push("=== COMPETITIVE INTEL ===\n");
  const subscriberCatNames = new Set(inputs.cma.subscriberCategories.map((c) => c.name));
  const competitorCatNames = new Set<string>();
  for (const cc of inputs.cma.competitorCategories) {
    for (const cat of cc.displayNames ?? []) {
      competitorCatNames.add(cat);
    }
  }
  const competitorHas = [...competitorCatNames].filter((c) => !subscriberCatNames.has(c));
  const subscriberHas = [...subscriberCatNames].filter((c) => !competitorCatNames.has(c));

  if (competitorHas.length > 0) {
    lines.push("Categories competitors hold that subscriber does NOT:");
    for (const c of competitorHas) lines.push(`  - ${c}`);
  } else {
    lines.push("Categories competitors hold that subscriber does NOT: (none observed)");
  }
  lines.push("");

  if (subscriberHas.length > 0) {
    lines.push("Categories subscriber holds that competitors do NOT:");
    for (const c of subscriberHas) lines.push(`  - ${c}`);
  } else {
    lines.push("Categories subscriber holds that competitors do NOT: (none observed)");
  }
  lines.push("");

  // Tier distribution
  const subSlug = inputs.cma.subscriberTier?.slug ?? null;
  if (subSlug) {
    const inTier = inputs.cma.topCompetitors.filter((c) => c.inferredTier?.tierSlug === subSlug).length;
    const total = inputs.cma.topCompetitors.length;
    lines.push(`Tier distribution: ${inTier} of ${total} ranking competitors are in-tier (${subSlug}); ${total - inTier} are cross-tier`);
  } else {
    lines.push("Tier distribution: subscriber tier not declared — all competitors are ambient context");
  }
  lines.push("");

  // ----- TACTICAL LAYER COVERAGE (kinds only, per locked decision #5) -----
  lines.push("=== TACTICAL LAYER COVERAGE ===\n");
  if (inputs.tacticalCoverage.length === 0) {
    lines.push("(no tactical recommendations produced yet)");
  } else {
    lines.push("The tactical CMA engine has produced recommendations in these areas:");
    for (const k of inputs.tacticalCoverage) lines.push(`  - ${k}`);
    lines.push("");
    lines.push("Do NOT restate these in your strategic output. Build strategic recommendations that complement, not duplicate.");
  }
  lines.push("");

  // ----- INSTRUCTIONS -----
  lines.push("=== INSTRUCTIONS ===\n");
  lines.push("Produce the strategic recommendation bundle per the principles in the system prompt.");
  lines.push("Output strict JSON only — no prose preamble, no markdown code fences.");
  lines.push("Populate meta.cma_snapshot_id and meta.cma_generated_at from the values:");
  lines.push(`  - cma_snapshot_id: ${inputs.cmaId}`);
  lines.push(`  - cma_generated_at: ${inputs.cmaGeneratedAt}`);

  return lines.join("\n");
}

function formatCompetitor(index: number, c: EnrichedCompetitor): string {
  const lines: string[] = [];
  const tierLabel = c.inferredTier?.tierLabel ?? "unclassified";
  lines.push(`${index}. ${c.title} [tier: ${tierLabel}]`);
  lines.push(
    `   type: ${c.type || "?"} | rating: ${c.rating ?? "?"} (${c.reviewsCount ?? 0} reviews) | appearances: ${c.appearanceCount} | avg position: ${c.averagePosition.toFixed(1)}`,
  );
  if (c.website) lines.push(`   website: ${c.website}`);
  if (c.address) lines.push(`   address: ${c.address}`);
  return lines.join("\n");
}

// ============================================================================
// Persistence — strategic_recommendations table (migration 139)
// ============================================================================

export type OwnerAction = "pending" | "approved" | "refined" | "rejected";

export interface PersistedStrategicRecommendation {
  id: string;
  businessId: string;
  brandIdentityId: string;
  cmaId: string;
  promptVersion: string;
  model: string;
  bundle: StatisticalBundle;
  inputTokens: number;
  outputTokens: number;
  ownerAction: OwnerAction;
  ownerActionAt: string | null;
  createdAt: string;
}

/**
 * Writes one strategic_recommendations row. Returns the new row id.
 * Caller (typically the generate route) wraps this around a
 * generateStatisticalRecommendation() call.
 */
export async function persistStrategicRecommendation(
  businessId: string,
  bundle: StatisticalBundle,
  persistence: PersistencePayload,
): Promise<{ id: string }> {
  const brandIdentityId = await getPrimaryBrandIdentityId(businessId);
  if (!brandIdentityId) {
    throw new Error(`No primary brand_identity for business ${businessId} — cannot persist strategic recommendation`);
  }
  const [row] = await sql`
    INSERT INTO strategic_recommendations (
      business_id,
      brand_identity_id,
      cma_id,
      prompt_version,
      system_prompt,
      user_message,
      model,
      raw_response,
      parsed_bundle,
      input_tokens,
      output_tokens
    ) VALUES (
      ${businessId},
      ${brandIdentityId},
      ${persistence.cmaSnapshotId},
      ${persistence.promptVersion},
      ${persistence.systemPrompt},
      ${persistence.userMessage},
      ${persistence.model},
      ${persistence.rawResponse},
      ${JSON.stringify(bundle)},
      ${persistence.inputTokens},
      ${persistence.outputTokens}
    )
    RETURNING id
  `;
  return { id: row.id as string };
}

/**
 * Most recent strategic recommendation for a business. Returns null
 * if none exists. Used by the review surface to display the latest
 * bundle pending owner action.
 */
export async function getLatestStrategicRecommendation(
  businessId: string,
): Promise<PersistedStrategicRecommendation | null> {
  const [row] = await sql`
    SELECT id, business_id, brand_identity_id, cma_id, prompt_version,
           model, parsed_bundle, input_tokens, output_tokens,
           owner_action, owner_action_at, created_at
    FROM strategic_recommendations
    WHERE business_id = ${businessId}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!row) return null;
  return {
    id: row.id as string,
    businessId: row.business_id as string,
    brandIdentityId: row.brand_identity_id as string,
    cmaId: row.cma_id as string,
    promptVersion: row.prompt_version as string,
    model: row.model as string,
    bundle: row.parsed_bundle as StatisticalBundle,
    inputTokens: Number(row.input_tokens),
    outputTokens: Number(row.output_tokens),
    ownerAction: row.owner_action as OwnerAction,
    ownerActionAt: row.owner_action_at as string | null,
    createdAt: row.created_at as string,
  };
}

/**
 * Update the owner_action lifecycle field. Returns true if a row was
 * updated. Idempotent — re-setting the same action just bumps
 * owner_action_at.
 */
export async function setStrategicRecommendationAction(
  id: string,
  action: OwnerAction,
): Promise<boolean> {
  const rows = await sql`
    UPDATE strategic_recommendations
    SET owner_action = ${action},
        owner_action_at = NOW()
    WHERE id = ${id}
    RETURNING id
  `;
  return rows.length > 0;
}

// ============================================================================
// TODO — items deferred until this scaffold is wired
// ============================================================================
//
// 1. Caller route: POST /api/admin/strategic-recommendation/[businessId]/generate
//      reads basics from businesses, calls loadStrategicInputs(),
//      calls generateStatisticalRecommendation(), then
//      persistStrategicRecommendation(), returns the bundle + id.
//
// 2. Review UX surface: /ops/strategic-recommendation/[businessId] with the
//      card layout spec from the prompt draft .md. Reads via
//      getLatestStrategicRecommendation(); writes via
//      setStrategicRecommendationAction() on approve/refine/reject.
//
// 3. Owner approval action: atomic write of all six elements into
//      brand_identity declared fields (offer.recommendation -> offer.declared,
//      positioning.angles -> positioning.angles declared, etc.). Use the
//      existing setDeclared() store API. Then setStrategicRecommendationAction(
//      id, "approved").
//
// 4. Refinement drill-down: per-element re-prompt with the bundle as
//      context + the specific element to refine. NEW SYSTEM PROMPT —
//      not the bundle prompt re-run. Updates parsed_bundle in place via
//      a new updateStrategicRecommendationBundle() writer; eventually
//      transitions owner_action to "refined" on approve.
