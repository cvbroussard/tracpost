/**
 * GBP categories coaching engine.
 *
 * Generates a ranked, opinionated 10-best GBP category set for a site
 * using the multi-signal intelligence stack:
 *
 *   1. Subscriber's existing categories     (preserves signal, even if poorly chosen)
 *   2. Subscriber's Brand DNA               (what they actually do)
 *   3. Subscriber's GBP profile description (self-stated positioning)
 *   4. Top competitors' category frequencies (battle-tested market reality)
 *
 * Output: 10 ranked categories with action verb (keep / add / drop /
 * promote_to_primary), confidence, and reasoning that cites the
 * underlying signal. The reasoning IS the coaching — subscriber/operator
 * sees WHY each call was made, not just the outcome.
 *
 * Scenario A architecture: opinionated overwrite. The intelligence stack
 * is comprehensive enough to outweigh subscriber intuition; the LLM
 * delivers a single 10-best plan, the operator reviews the reasoning.
 * (See project_tracpost_gbp_categories_coaching memory.)
 *
 * Hard dependency: a completed competitive_market_analyses row must
 * exist for the site (the β rule). Without competitor signal the
 * recommendations degenerate to subscriber-intuition Scenario A — which
 * the strategic posture rejects.
 */
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { AnalysisPayload } from "./analysis-assembly";
import type { CompetitorCategories } from "./serp-fetch";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type CoachedAction = "keep" | "add" | "drop" | "promote_to_primary";

export interface CoachedCategory {
  gcid: string;
  name: string;
  /** What we're proposing to do with this category */
  action: CoachedAction;
  /** Is this the proposed PRIMARY category? At most one entry should be true. */
  proposedPrimary: boolean;
  /** LLM-estimated confidence 0-1 — how strong is the signal backing this call */
  confidence: number;
  /** Subscriber-readable explanation that cites the underlying signal */
  reasoning: string;
}

export interface CoachingResult {
  /** The 10-best ranked category list */
  categories: CoachedCategory[];
  /** Diff summary for quick scanning at the operator/subscriber surface */
  summary: {
    keep: number;
    add: number;
    drop: number;
    primaryChanged: boolean;
    currentPrimaryGcid: string | null;
    proposedPrimaryGcid: string | null;
  };
  /** When the coaching was generated */
  generatedAt: string;
  /** Reference to the CMA payload that fed this coaching (for traceability) */
  sourceAnalysisId: string;
}

export interface CoachingInputs {
  siteId: string;
  /** Site display name (for reasoning context) */
  siteName: string;
  /** Site's currently-declared GBP categories */
  currentCategories: Array<{ gcid: string; name: string; isPrimary: boolean }>;
  /** Self-stated business description from GBP profile (often 1-3 sentences) */
  gbpDescription: string | null;
  /** Brand DNA payload if available (we'll digest the signals slice) */
  brandDna: Record<string, unknown> | null;
  /** The CMA payload (top competitors + Tier 2 categories) */
  analysis: AnalysisPayload;
  /** The CMA row id (for traceability in result) */
  analysisId: string;
}

const SYSTEM_PROMPT = `You are TracPost's GBP categories strategist. Your job: produce the 10-best GBP category set for this business, ranked by relevance and impact, with one PRIMARY designation.

This is a coaching artifact — operator/subscriber will see your reasoning and accept, edit, or reject your plan. Reasoning quality earns trust; opaque or generic reasoning loses it.

INPUTS YOU GET (treat each as a different signal):
- The business's currently-declared GBP categories (subscriber said this — preserves their signal even when imperfect)
- Their GBP self-description (their own voice on what they do)
- Brand DNA signals (TracPost's analysis of their actual content/voice)
- Top SERP competitors' full category lists with a frequency digest (battle-tested market reality — what's actually winning in this geo + sector)
- A relevant slice of the GBP gcid catalog you may pick from

CRITICAL RULES:

1. **NEVER INVENT GCIDS.** Only return gcids that appear in the inputs (current categories OR competitor categories OR the catalog slice). If a gcid isn't in the inputs, you don't have permission to use it.

2. **GBP allows at most 10 categories: 1 primary + 9 additional.** Your output must have exactly one entry with proposedPrimary=true, and 9 with proposedPrimary=false. Total: 10.

3. **PRIMARY category carries the most ranking weight.** Choose carefully. The current primary should USUALLY stay (don't churn) unless the competitive data strongly suggests a different primary would better-position the business.

4. **Cite SIGNAL in reasoning, not assertions.** Examples of good reasoning:
   - "3 of 10 top SERP competitors use this category (L&C, Patina, Marvista). Your portfolio likely supports it."
   - "Subscriber's GBP description mentions 'kitchen remodels' explicitly. Direct alignment."
   - "Brand DNA signals positioning on 'craftsmanship and material quality' — Custom home builder is consistent with that frame."
   Bad reasoning: "This is a good category" / "Adds variety" / "Most contractors have this"

5. **Honor existing signal.** Categories the subscriber currently has should default to 'keep' unless competitive data shows they're irrelevant (zero competitor presence + no Brand DNA support). 'drop' should be rare and well-justified.

6. **Filter noise categories.** Some Google categories are taxonomy artifacts (e.g., 'establishment_service', 'point_of_interest_establishment'). Don't propose these.

7. **Skip non-competitor competitors.** If a SERP result is in an adjacent industry (e.g., paint-and-sip entertainment ranking on 'painting' queries), don't let their categories influence your recommendations. The CMA may flag these — use judgment.

8. **Confidence calibration:**
   - 0.85+ = strong cross-signal alignment (multiple competitors + Brand DNA + subscriber declaration agree)
   - 0.6-0.85 = decent signal (one strong source or moderate convergence)
   - 0.4-0.6 = weak signal, exploratory inclusion to fill the 10-slot budget
   - <0.4 = don't include

9. **Subscriber-readable voice.** Write reasoning a small business owner would understand. No engineering jargon.

OUTPUT: Return ONLY a JSON array of exactly 10 category objects. No prose preamble, no markdown code fences. Strict JSON.

Each object shape:
{
  "gcid": "gcid:foo_bar",
  "name": "Display Name From Inputs",
  "action": "keep" | "add" | "drop" | "promote_to_primary",
  "proposedPrimary": true | false,
  "confidence": 0.0-1.0,
  "reasoning": "Specific signal-citing explanation."
}`;

/**
 * Build a digest of competitor category frequency across all top
 * competitors. This becomes the "battle-tested market signal" we feed
 * the LLM as a pre-computed table, reducing the work it has to do AND
 * the chance it miscounts.
 */
function buildCompetitorFrequencyDigest(
  competitorCategories: CompetitorCategories[],
): Map<string, { count: number; competitors: string[]; primaryCount: number; displayName: string }> {
  const map = new Map<string, { count: number; competitors: string[]; primaryCount: number; displayName: string }>();
  for (const cc of competitorCategories) {
    for (let i = 0; i < cc.gcids.length; i++) {
      const gcid = cc.gcids[i];
      const name = cc.displayNames[i];
      const isPrimary = gcid === cc.primaryGcid;
      const entry = map.get(gcid) ?? { count: 0, competitors: [], primaryCount: 0, displayName: name };
      entry.count++;
      if (!entry.competitors.includes(cc.title)) entry.competitors.push(cc.title);
      if (isPrimary) entry.primaryCount++;
      map.set(gcid, entry);
    }
  }
  return map;
}

/**
 * Distill Brand DNA into a few-line digest the coaching LLM can use
 * without choking on the full signal payload. We don't need the
 * playbook — we need the WHAT-THEY-DO signals.
 */
function distillBrandDna(brandDna: Record<string, unknown> | null): string {
  if (!brandDna) return "(no Brand DNA available)";
  const signals = (brandDna.signals || {}) as Record<string, unknown>;
  const subscriberAngle = (brandDna.subscriber_angle || null) as string | null;
  const voice = (signals.voice || {}) as Record<string, unknown>;
  const lines: string[] = [];
  if (subscriberAngle) lines.push(`Positioning angle: ${subscriberAngle}`);
  if (voice.distinctive_traits) {
    const traits = (voice.distinctive_traits as string[]).slice(0, 3);
    lines.push(`Voice traits: ${traits.join("; ")}`);
  }
  if (voice.tone) lines.push(`Tone: ${voice.tone as string}`);
  return lines.length > 0 ? lines.join("\n") : "(Brand DNA present but no usable signals)";
}

export async function generateCategoryCoaching(inputs: CoachingInputs): Promise<CoachingResult> {
  const { siteName, currentCategories, gbpDescription, brandDna, analysis, analysisId } = inputs;

  // Build the competitor frequency digest
  const frequencyMap = buildCompetitorFrequencyDigest(analysis.competitorCategories || []);
  const frequencyEntries = Array.from(frequencyMap.entries())
    .map(([gcid, v]) => ({ gcid, ...v }))
    .sort((a, b) => b.count - a.count);

  // Gather the full gcid universe for "catalog slice" hint to the LLM —
  // every gcid that's currently on subscriber OR appeared on a competitor.
  // Plus we can include a tail of sector-adjacent gcids from gbp_categories
  // to expose adjacent ideas the LLM might pick from. For V1 keep it tight:
  // just the union of subscriber + competitor gcids.
  const universeGcids = new Set<string>();
  for (const c of currentCategories) universeGcids.add(c.gcid);
  for (const cc of analysis.competitorCategories || []) {
    for (const g of cc.gcids) universeGcids.add(g);
  }
  const catalogSlice = await sql`
    SELECT gcid, name FROM gbp_categories
    WHERE gcid = ANY(${Array.from(universeGcids)}::text[])
    ORDER BY name
  `;

  const userMessage = buildPrompt({
    siteName,
    currentCategories,
    gbpDescription,
    brandDnaDigest: distillBrandDna(brandDna),
    frequencyEntries,
    catalogSlice: catalogSlice as Array<{ gcid: string; name: string }>,
    competitorCount: (analysis.competitorCategories || []).length,
  });

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("LLM returned no JSON array");
  const categories = JSON.parse(match[0]) as CoachedCategory[];

  // Validate output shape
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error("LLM returned empty or non-array category list");
  }
  const primaries = categories.filter((c) => c.proposedPrimary);
  if (primaries.length !== 1) {
    console.warn(`Coaching returned ${primaries.length} primary candidates (expected 1) — caller may need to resolve`);
  }

  const currentPrimary = currentCategories.find((c) => c.isPrimary)?.gcid || null;
  const proposedPrimary = primaries[0]?.gcid || null;

  return {
    categories,
    summary: {
      keep: categories.filter((c) => c.action === "keep").length,
      add: categories.filter((c) => c.action === "add").length,
      drop: categories.filter((c) => c.action === "drop").length,
      primaryChanged: currentPrimary !== proposedPrimary,
      currentPrimaryGcid: currentPrimary,
      proposedPrimaryGcid: proposedPrimary,
    },
    generatedAt: new Date().toISOString(),
    sourceAnalysisId: analysisId,
  };
}

interface PromptArgs {
  siteName: string;
  currentCategories: Array<{ gcid: string; name: string; isPrimary: boolean }>;
  gbpDescription: string | null;
  brandDnaDigest: string;
  frequencyEntries: Array<{ gcid: string; displayName: string; count: number; competitors: string[]; primaryCount: number }>;
  catalogSlice: Array<{ gcid: string; name: string }>;
  competitorCount: number;
}

function buildPrompt(a: PromptArgs): string {
  const lines: string[] = [];

  lines.push(`Business: ${a.siteName}\n`);

  lines.push("=== CURRENT GBP CATEGORIES (subscriber's declared set) ===\n");
  if (a.currentCategories.length === 0) {
    lines.push("(greenfield — no categories declared yet)");
  } else {
    for (const c of a.currentCategories) {
      lines.push(`  ${c.isPrimary ? "★ PRIMARY: " : "          "}${c.gcid}  →  ${c.name}`);
    }
  }
  lines.push("");

  lines.push("=== GBP SELF-DESCRIPTION ===\n");
  lines.push(a.gbpDescription || "(no description in GBP profile)");
  lines.push("");

  lines.push("=== BRAND DNA DIGEST ===\n");
  lines.push(a.brandDnaDigest);
  lines.push("");

  lines.push(`=== COMPETITOR CATEGORY FREQUENCY (across ${a.competitorCount} top SERP competitors) ===\n`);
  lines.push("Sorted by appearance count. primaryCount = how many competitors lead with this category.\n");
  for (const e of a.frequencyEntries) {
    lines.push(`  ${e.count}/${a.competitorCount}  [primary on ${e.primaryCount}]  ${e.gcid}  →  ${e.displayName}`);
    lines.push(`     used by: ${e.competitors.join(", ")}`);
  }
  lines.push("");

  lines.push("=== AVAILABLE GCID CATALOG SLICE (only pick from these) ===\n");
  for (const c of a.catalogSlice) {
    lines.push(`  ${c.gcid}  →  ${c.name}`);
  }
  lines.push("");

  lines.push("=== ASK ===\n");
  lines.push("Return exactly 10 categories as a JSON array. Exactly 1 with proposedPrimary=true, 9 with proposedPrimary=false.");
  lines.push("Use action values: keep (currently declared, keep it), add (new), drop (currently declared but should be removed), promote_to_primary (currently declared as additional, should become primary).");
  lines.push("Cite specific signal in every `reasoning` field — competitor names, brand DNA traits, description phrases.");

  return lines.join("\n");
}

/**
 * Convenience wrapper: load all inputs for a site, run coaching, return result.
 * Throws if the β rule is violated (no completed CMA exists for this site).
 */
export async function coachCategoriesForSite(siteId: string): Promise<CoachingResult> {
  const [site] = await sql`
    SELECT
      id, name,
      gbp_profile->>'description' AS gbp_description,
      brand_dna,
      (SELECT JSON_AGG(JSON_BUILD_OBJECT('gcid', gc.gcid, 'name', gc.name, 'isPrimary', sgc.is_primary))
       FROM site_gbp_categories sgc JOIN gbp_categories gc ON gc.gcid = sgc.gcid
       WHERE sgc.site_id = ${siteId}) AS current_categories
    FROM sites WHERE id = ${siteId}
  `;
  if (!site) throw new Error(`Site ${siteId} not found`);

  const [cma] = await sql`
    SELECT id, analysis_data
    FROM competitive_market_analyses
    WHERE site_id = ${siteId} AND status = 'complete'
    ORDER BY generated_at DESC LIMIT 1
  `;
  if (!cma) {
    throw new Error(
      `No completed competitive market analysis exists for site ${siteId}. ` +
        `Category coaching requires CMA data (β rule). Run the CMA first.`,
    );
  }

  return generateCategoryCoaching({
    siteId,
    siteName: site.name as string,
    currentCategories: (site.current_categories || []) as CoachingInputs["currentCategories"],
    gbpDescription: (site.gbp_description as string) || null,
    brandDna: (site.brand_dna as Record<string, unknown>) || null,
    analysis: cma.analysis_data as AnalysisPayload,
    analysisId: cma.id as string,
  });
}
