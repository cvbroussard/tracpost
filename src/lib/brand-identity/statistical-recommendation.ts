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

// Per the substrate-libraries layer (2026-06-02): hooks/tagline/cta are
// DERIVED-substrate populated by their own pipelines, NOT by the strategic
// engine. Pains/triggers are SOURCE-substrate populated by extraction +
// validation pipelines, NOT by the strategic engine.
//
// The engine produces ONLY the strategic core (offer / audience profile /
// positioning) + disqualification signal + meta. Everything else moved out
// of the bundle in 2026-06-02 to live in the substrate library layer.
//
// The types below remain exported because (a) the brand-identity Statistical
// read-only UI still renders these shapes for any legacy declared data and
// (b) when substrate-library pipelines land, they'll consume these same
// shapes as their output contract. See:
//   - [[substrate-libraries-layer]] memory for the source/derived split
//   - [[brand-identity-schema]] memory for Statistical/Creative bucket lock
export type HookFormat = "headline" | "first-2-seconds" | "thumb-stopper" | "objection-handle";

export interface OfferRec {
  recommendation: string;
  reasoning: string;
  confidence: Confidence;
  coherence: string;
}

export interface AudienceRec {
  primary: string;
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
  /** ORDERED: angles[0] is the lead. LLM ranks. */
  angles: PositioningAngle[];
  reasoning: string;
  coherence: string;
}

/**
 * @deprecated Engine no longer produces hooks. Hooks are derived-substrate
 * populated by `business_hooks` library pipelines. Shape retained for UI
 * rendering of legacy data and for the future hooks library output contract.
 */
export interface HookRec {
  hook: string;
  ladders_to: string;
  format: HookFormat;
}

/**
 * @deprecated Engine no longer produces taglines. Tagline variants are
 * derived-substrate populated by `business_tagline_variants` library
 * pipelines. Shape retained for UI rendering of legacy data.
 */
export interface TaglineRec {
  recommendation: string | null;
  reasoning: string;
  confidence: Confidence | null;
  coherence: string;
  cause?: string;
}

/**
 * @deprecated Engine no longer produces CTAs. CTA variants are derived-
 * substrate populated by `business_cta_variants` library pipelines. Shape
 * retained for UI rendering of legacy data.
 */
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
}

export interface StatisticalBundle {
  offer: OfferRec | null;
  audience: AudienceRec | null;
  positioning: PositioningRec | null;
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
 * don't constrain strategic output (visual, sonic).
 */
export interface CreativeDeclarations {
  tone: string | null;
  lexicon: string | null;
  avoid: string | null;
  voice_source: string | null;
  mechanical_style: string | null;
  proof: string | null;
}

// ============================================================================
// SYSTEM PROMPT — see prompt draft .md for the full spec + locked decisions
// ============================================================================

const SYSTEM_PROMPT = `You are a senior brand strategist at a top-tier marketing agency. You're producing the opening strategic recommendation for a small-to-mid market business that has retained you. This is the deliverable that turns the Competitive Market Analysis into actionable brand strategy — the moment the engagement transitions from "here's what we found" to "here's where you should stand."

You produce ONE coherent strategy bundle with three interlocking strategic elements. They are not three independent recommendations — they are one strategy expressed three ways. The Positioning is the spine; Audience is who it speaks to; Offer is the recommended lead commercial motion. All three must hang together.

SCOPE BOUNDARY — IMPORTANT:

Executional artifacts (Hooks, Tagline, CTA) and audience substrate (Pains, Triggers) are produced by SEPARATE substrate-library pipelines, NOT by you. Do not generate them. Do not include them in your output. Even if the user message contains hints about declared voice/pains, your job is the strategic core only.

PRINCIPLES YOU OPERATE BY:

1. **Evidence over opinion.** Every claim points to specific data in the CMA snapshot. Patterns like "7 of 10 ranking competitors are tagged as <X>, you're tagged as <Y>" earn trust. Vague claims ("focus on quality") do not.

2. **Disqualify when the evidence demands it.** If the subscriber's plausible positioning would lie outside the top consumer-demand patterns visible in the CMA, set the disqualification_signal field explicitly. Do not invent a positioning to fit a brand that doesn't fit the market. (Example: "no competitor ranks for the wedge this brand would naturally claim — recommend off-ramp to human-curated marketing.") Severity "strong" hides the bundle in UI behind an opt-in disclosure; "advisory" surfaces both bundle and off-ramp side-by-side.

3. **Coherence is the deliverable, not the elements.** A great Positioning paired with an Audience it doesn't serve, or an Offer that doesn't transact what the Positioning promises, is a failed recommendation. Each element must explain its connection to the others via its coherence field.

4. **Voice respects existing creative declarations.** If the owner has declared tone, lexicon, voice_source, or proof preferences, your prose in positioning angles (wedge, contrast, example) should operate in that voice. If no creative descriptors are declared, default to category-norm voice but flag the inheritance in your reasoning.

5. **Positioning is multi-angle and you rank them.** Per locked architecture, the brand may have multiple legitimate strategic territories. If CMA evidence supports it, produce up to 3 angles. Each angle = (label, wedge, contrast, example, applies_to). The angles array is ORDERED — index 0 is the lead angle (highest evidence weight + confidence). Alternatives follow in descending strength. Single-angle is acceptable when evidence supports only one. Do not produce equal-weighted alternatives — if you cannot rank them, you do not have enough evidence to produce them.

6. **Audience is the strategic profile, not pain inventory.** The audience.primary field captures WHO the brand serves — demographic + geographic + psychographic + price-band — derived from CMA service areas, category mix, competitor tier, and brand basics. Do NOT include pain inventories, trigger inventories, or other substrate-library content in your audience output. Substrate libraries handle that.

7. **Offer is the lead commercial motion, not the catalog.** The offer.recommendation prescribes the recommended primary intake/conversion mechanism — what the brand should LEAD WITH commercially (e.g., paid Discovery consultation, tasting menu reservation, architecture session). It is NOT a list of services (GBP categories handle that) or benefits (substrate libraries handle that). Single strategic statement.

8. **No filler.** If you cannot produce a strong recommendation for an element because the CMA is thin, return null for that element. List the gaps in meta.data_insufficient_for. Do not invent.

9. **Cite the data explicitly.** Reasoning fields should read like an agency analyst: "Among 10 ranking competitors in your local pack across 6 queries, 4 cite 'remodeling contractor' as primary type while you cite 'general contractor' — this is the category gap that suppresses your visibility on the highest-intent searches in your area."

VOICE CALIBRATION:

The businesses ranking on the subscriber's SERPs are typically mid-to-bottom-tier operators who clear a low hygiene bar. The best operators in any given geo are usually invisible to digital channels (referrals, reputation, offline networks). Don't position competitors as aspirational standards — they're evidence of how achievable the rank gap is. Opportunity frame, not anxiety frame.

OUTPUT FORMAT:

Return ONLY strict JSON matching the schema below. No prose preamble, no markdown code fences. The JSON must be parseable as-is. Output ONLY the fields listed — no hooks, tagline, cta, pains, or triggers fields.

{
  "offer": { "recommendation": string, "reasoning": string, "confidence": "high"|"medium"|"exploratory", "coherence": string } | null,
  "audience": { "primary": string, "reasoning": string, "confidence": "high"|"medium"|"exploratory", "coherence": string } | null,
  "positioning": {
    "angles": [{ "label": string, "wedge": string, "contrast": string, "example": string, "applies_to": string[], "confidence": "high"|"medium"|"exploratory" }],
    "reasoning": string,
    "coherence": string
  } | null,
  "disqualification_signal": null | { "severity": "advisory"|"strong", "reasoning": string, "off_ramp_recommendation": string },
  "meta": {
    "cma_snapshot_id": string,
    "cma_generated_at": string,
    "subscriber_categories": string[],
    "subscriber_tier": string | null,
    "data_sufficient_for": string[],
    "data_insufficient_for": string[]
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
 *
 * Brand basics are read CANONICALLY from `businesses` (name +
 * founder_name + founding_year + origin_context per migration 140).
 * Optional `override` lets a caller supply enrichment values not yet
 * persisted (e.g., ops fills founder_name in the request body before
 * the canonical column gets backfilled). Override fields layer on top
 * of DB values; the merged result is the BrandBasics passed to the LLM.
 *
 * Returns a typed error when prerequisites are missing — caller decides
 * UX (e.g., "Run the CMA first before requesting a strategic recommendation").
 */
export async function loadStrategicInputs(
  siteId: string,
  override?: Partial<BrandBasics>,
): Promise<LoadInputsResult | LoadInputsError> {
  const [businessRow] = await sql`
    SELECT name, founder_name, founding_year, origin_context
    FROM businesses WHERE id = ${siteId} LIMIT 1
  `;
  if (!businessRow) {
    return {
      ok: false,
      reason: "missing_basics",
      message: `Business ${siteId} not found.`,
    };
  }

  const canonicalName = (businessRow.name as string | null) ?? "";
  const overrideName = override?.businessName?.trim() ?? "";
  const businessName = overrideName || canonicalName;
  if (!businessName.trim()) {
    return {
      ok: false,
      reason: "missing_basics",
      message: "Business has no name set — cannot generate strategic recommendation.",
    };
  }

  const basics: BrandBasics = {
    businessName,
    ownerName: override?.ownerName ?? (businessRow.founder_name as string | null) ?? null,
    foundingYear:
      override?.foundingYear ?? (businessRow.founding_year as number | null) ?? null,
    originContext:
      override?.originContext ?? (businessRow.origin_context as string | null) ?? null,
  };

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
    voice_source: text("voice_source"),
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
    if (cd.voice_source) lines.push(`  - voice source: ${cd.voice_source}`);
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
 *
 * Use this for "rejected" — for "approved" prefer
 * approveStrategicRecommendation() which atomically writes to declared.
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
// Approval — atomic write of bundle into brand_descriptor.declared
// ============================================================================
//
// The Statistical bucket is a recommendation-driven path. Owner doesn't type
// declared values; the engine produces them. So for these 6 descriptors,
// the BUNDLE element IS the declared shape. The catalog input schemas
// (designed for Creative-style owner authorship) are vestigial here.
//
// Mapping (per locked Statistical/Creative bucket split, 2026-06-01):
//   bundle.offer        → brand_descriptor[key=offer].declared
//   bundle.audience     → brand_descriptor[key=audience].declared
//   bundle.positioning  → brand_descriptor[key=positioning].declared
//   bundle.hooks        → brand_descriptor[key=hooks].declared
//   bundle.tagline      → brand_descriptor[key=tagline].declared
//   bundle.cta          → brand_descriptor[key=cta].declared
//
// Null bundle elements are skipped (no descriptor write). hooks is always
// written (even empty array — "no hooks recommended" is meaningful).
// status flips to 'extracted' because the bundle IS the finalized form
// (no Stage 1/2 extraction needed for Statistical descriptors — the
// engine already did the work).
//
// Skips setDeclared's owner-authored machinery (owner_original locks,
// stale-finding preservation, substrate-conditional anchors) because none
// applies to the engine-authored Statistical path.

// Re-exported from the client-safe bucket module so consumers that need
// the canonical Statistical keys can import from here OR from buckets.ts.
// Single source of truth lives in buckets.ts (no server imports).
export {
  STATISTICAL_DESCRIPTOR_KEYS,
  type StatisticalDescriptorKey,
} from "./buckets";
import type { StatisticalDescriptorKey } from "./buckets";

export interface ApprovalResult {
  ok: boolean;
  descriptorsWritten: number;
  skipped: StatisticalDescriptorKey[];
}

/**
 * Atomically approve a strategic recommendation:
 *   1. Write each non-null bundle element into the matching
 *      brand_descriptor.declared row (status → 'extracted').
 *   2. Flip the strategic_recommendations.owner_action to 'approved'.
 *
 * All operations in a single transaction. Idempotent — re-approving the
 * same rec re-writes declared (no-op if bundle unchanged) and bumps
 * owner_action_at.
 */
export async function approveStrategicRecommendation(
  recId: string,
): Promise<ApprovalResult> {
  const [recRow] = await sql`
    SELECT brand_identity_id, parsed_bundle
    FROM strategic_recommendations
    WHERE id = ${recId}
    LIMIT 1
  `;
  if (!recRow) {
    throw new Error(`Strategic recommendation ${recId} not found`);
  }

  const brandIdentityId = recRow.brand_identity_id as string;
  const bundle = recRow.parsed_bundle as StatisticalBundle;

  // Build the write set — engine bundle ONLY produces strategic core
  // (offer / audience / positioning). Hooks / tagline / cta are now
  // populated by substrate-library pipelines (see [[substrate-libraries-layer]])
  // and are deliberately NOT touched by the approve action — their
  // brand_descriptor.declared rows are left in whatever prior state.
  const writes: Array<{ key: StatisticalDescriptorKey; value: unknown }> = [];
  const skipped: StatisticalDescriptorKey[] = [];

  if (bundle.offer) writes.push({ key: "offer", value: bundle.offer });
  else skipped.push("offer");

  if (bundle.audience) writes.push({ key: "audience", value: bundle.audience });
  else skipped.push("audience");

  if (bundle.positioning) writes.push({ key: "positioning", value: bundle.positioning });
  else skipped.push("positioning");

  // hooks / tagline / cta intentionally not written — substrate-library scope

  // Compose the atomic transaction: N descriptor updates + 1 lifecycle flip
  const queries = writes.map(({ key, value }) =>
    sql`
      UPDATE brand_descriptor
      SET declared = ${JSON.stringify(value)}::jsonb,
          status   = 'extracted'
      WHERE brand_identity_id = ${brandIdentityId}
        AND key = ${key}
    `,
  );
  queries.push(sql`
    UPDATE strategic_recommendations
    SET owner_action    = 'approved',
        owner_action_at = NOW()
    WHERE id = ${recId}
  `);

  await sql.transaction(queries);

  return {
    ok: true,
    descriptorsWritten: writes.length,
    skipped,
  };
}

// ============================================================================
// Staleness assessment — structural diff between rec's CMA and latest CMA
// ============================================================================
//
// CMA re-runs happen on an analytical cadence (weekly/monthly) for marketing
// performance telemetry. Most re-runs leave the STRUCTURAL inputs unchanged
// — same GBP categories, same service areas, same tier — and only the SERP
// layer churns. Naive "cma_id differs" staleness would ping the operator
// every cadence with no real reason.
//
// Instead, compare the three structural fields that actually reshape the
// strategic recommendation:
//   - subscriberCategories  (by gcid set + primary flag)
//   - subscriberServiceAreas (by placeId set)
//   - subscriberTier         (by slug equality)
//
// If any of those differs between the rec's source CMA and the latest CMA,
// the rec is structurally stale and regeneration is warranted. The SERP
// layer is allowed to churn freely without triggering anything.

export type StalenessField = "categories" | "service_areas" | "tier";

export interface StalenessChange {
  field: StalenessField;
  description: string;
}

export interface StalenessAssessment {
  stale: boolean;
  changes: StalenessChange[];
  recCmaId: string;
  recCmaGeneratedAt: string;
  latestCmaId: string;
  latestCmaGeneratedAt: string;
}

/**
 * Compare the rec's source CMA against the latest CMA. Returns null when
 * either CMA can't be found (e.g., no latest CMA exists for this business,
 * or the rec references a CMA that's been deleted — guarded by FK RESTRICT
 * but defensive). Returns assessment with `stale: false` when latest CMA
 * IS the rec's CMA, or when structural fields are identical.
 */
export async function assessStaleness(
  businessId: string,
  recCmaId: string,
): Promise<StalenessAssessment | null> {
  const [latestRow] = await sql`
    SELECT id, generated_at, analysis_data
    FROM competitive_market_analyses
    WHERE business_id = ${businessId} AND status = 'complete'
    ORDER BY generated_at DESC
    LIMIT 1
  `;
  if (!latestRow) return null;

  // Fast path: latest CMA IS the rec's CMA — no diff possible
  if (latestRow.id === recCmaId) {
    return {
      stale: false,
      changes: [],
      recCmaId,
      recCmaGeneratedAt: latestRow.generated_at as string,
      latestCmaId: latestRow.id as string,
      latestCmaGeneratedAt: latestRow.generated_at as string,
    };
  }

  const [recRow] = await sql`
    SELECT generated_at, analysis_data
    FROM competitive_market_analyses
    WHERE id = ${recCmaId} LIMIT 1
  `;
  if (!recRow) return null;

  const recCma = recRow.analysis_data as AnalysisPayload;
  const latestCma = latestRow.analysis_data as AnalysisPayload;
  const changes = diffStructuralFields(recCma, latestCma);

  return {
    stale: changes.length > 0,
    changes,
    recCmaId,
    recCmaGeneratedAt: recRow.generated_at as string,
    latestCmaId: latestRow.id as string,
    latestCmaGeneratedAt: latestRow.generated_at as string,
  };
}

function diffStructuralFields(oldCma: AnalysisPayload, newCma: AnalysisPayload): StalenessChange[] {
  const changes: StalenessChange[] = [];

  // Categories: compare by gcid set (renames in the canonical catalog do
  // not count as a structural change). If the set is identical, compare
  // primary flag separately — moving primary to a different category does
  // reshape the strategic positioning.
  const oldByGcid = new Map(oldCma.subscriberCategories.map((c) => [c.gcid, c]));
  const newByGcid = new Map(newCma.subscriberCategories.map((c) => [c.gcid, c]));
  const addedCats: string[] = [];
  const removedCats: string[] = [];
  for (const [gcid, cat] of newByGcid) {
    if (!oldByGcid.has(gcid)) addedCats.push(cat.name);
  }
  for (const [gcid, cat] of oldByGcid) {
    if (!newByGcid.has(gcid)) removedCats.push(cat.name);
  }
  if (addedCats.length > 0 || removedCats.length > 0) {
    const parts: string[] = [];
    if (addedCats.length > 0) parts.push(`added ${addedCats.map((n) => `"${n}"`).join(", ")}`);
    if (removedCats.length > 0) parts.push(`removed ${removedCats.map((n) => `"${n}"`).join(", ")}`);
    changes.push({ field: "categories", description: `GBP categories ${parts.join("; ")}` });
  } else {
    const oldPrimary = oldCma.subscriberCategories.find((c) => c.isPrimary);
    const newPrimary = newCma.subscriberCategories.find((c) => c.isPrimary);
    if (oldPrimary?.gcid !== newPrimary?.gcid) {
      changes.push({
        field: "categories",
        description: `Primary category changed from "${oldPrimary?.name ?? "none"}" to "${newPrimary?.name ?? "none"}"`,
      });
    }
  }

  // Service areas: compare by placeId set
  const oldAreasByPid = new Map(oldCma.subscriberServiceAreas.map((a) => [a.placeId, a]));
  const newAreasByPid = new Map(newCma.subscriberServiceAreas.map((a) => [a.placeId, a]));
  const addedAreas: string[] = [];
  const removedAreas: string[] = [];
  for (const [pid, area] of newAreasByPid) {
    if (!oldAreasByPid.has(pid)) addedAreas.push(area.placeName);
  }
  for (const [pid, area] of oldAreasByPid) {
    if (!newAreasByPid.has(pid)) removedAreas.push(area.placeName);
  }
  if (addedAreas.length > 0 || removedAreas.length > 0) {
    const parts: string[] = [];
    if (addedAreas.length > 0) parts.push(`added ${addedAreas.map((n) => `"${n}"`).join(", ")}`);
    if (removedAreas.length > 0) parts.push(`removed ${removedAreas.map((n) => `"${n}"`).join(", ")}`);
    changes.push({ field: "service_areas", description: `Service areas ${parts.join("; ")}` });
  }

  // Tier: slug equality (null-safe)
  const oldTier = oldCma.subscriberTier?.slug ?? null;
  const newTier = newCma.subscriberTier?.slug ?? null;
  if (oldTier !== newTier) {
    const oldLabel = oldCma.subscriberTier?.label ?? "not set";
    const newLabel = newCma.subscriberTier?.label ?? "not set";
    changes.push({
      field: "tier",
      description: `Commercial tier changed from "${oldLabel}" to "${newLabel}"`,
    });
  }

  return changes;
}

// ============================================================================
// TODO — items deferred
// ============================================================================
//
// 1. Refinement drill-down: per-element re-prompt with the bundle as
//      context + the specific element to refine. NEW SYSTEM PROMPT —
//      not the bundle prompt re-run. Updates parsed_bundle in place via
//      a new updateStrategicRecommendationBundle() writer; eventually
//      transitions owner_action to "refined" on approve.
//
// 2. Alternative-angle approve actions in positioning card ("Approve
//      this instead" / "Approve in addition") — bundle-mutation
//      operations, NOT full re-approve. Belongs with refinement work.
//
// 3. Holistic quality pass (Statistical × Creative cross-bucket grader)
//      per [[brand-identity-schema]] — deferred until both buckets are
//      committed on at least one real brand. Needs real-data rubric
//      anchoring; abstract checklists produce abstract verifiers.
