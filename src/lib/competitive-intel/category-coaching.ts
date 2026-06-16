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
import type { IntentCluster } from "./intent-clustering";

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
  /**
   * Intent cluster_ids this category serves (M:N tag — populated by
   * tagCoachedCategoriesWithClusters() post-processor when intent
   * clustering has run). Empty array if no clustering output is
   * available (legacy path before [[services-pipeline-doctrine]]
   * second-pass refinement landed). Used by the deterministic M:N
   * junction binder to wire service_gbp_categories rows.
   */
  cluster_ids?: string[];
}

export interface CoachingResult {
  /** The 10-best ranked category list */
  categories: CoachedCategory[];
  /** Diff summary for quick scanning at the operator/subscriber surface */
  summary: {
    keep: number;
    add: number;
    /** Categories the LLM explicitly marked with action='drop'. */
    drop: number;
    /**
     * Categories the subscriber currently declares that are ABSENT from
     * the proposed 10-best list (and therefore removed on apply, even
     * though the LLM didn't tag them with action='drop'). Surfaced
     * separately so the operator/subscriber sees the full removal set,
     * not just the LLM's explicit drops. (Bug fix per #231.)
     */
    implicitlyDropped: Array<{ gcid: string; name: string; wasPrimary: boolean }>;
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

MARKET CONTEXT (internalize this before writing — it shapes how you cite competitor signal):

The businesses ranking on this market's SERPs are NOT typically the capability leaders. They are mid-to-bottom-tier operators who happen to do basic SEO + GBP hygiene at a moderate level. The actually-best operators in the geo are usually invisible to digital channels. The SERP rewards online hygiene; it does NOT measure operational excellence.

What this means for your reasoning:

- Treat competitor category mixes as "what mid-tier operators do to clear the local SEO bar" — NOT as "what the best operators in this market do." Their categories show what CLEARS THE BAR, not what represents excellence.
- The subscriber is likely a capability-superior operator who hasn't done the SEO basics. Your job is to put them at the bar that mid-tier competitors are clearing. The lift is achievable.
- Confidence in coaching outputs goes UP, not down, because the bar to clear is empirically demonstrated low.

TIER PARTITION (load-bearing for category recommendations):

The competitor frequency digest below is split into TWO sets:

- **In-tier frequency** — categories used by SERP competitors classified into the subscriber's declared commercial tier. These are the operators the subscriber chose to compete against. THIS is the primary signal for what categories to keep, add, or promote — these competitors share the subscriber's structural position and clientele.

- **Cross-tier ambient** — categories used by SERP competitors in different tiers (specialty trades, scale operators, out-of-category). These appear in the same SERPs but compete for different customers. DO NOT use cross-tier category usage as a reason to add categories the subscriber isn't already declaring. Cross-tier signal is informational only — useful to flag "an out-of-category business outranks you here" as bar evidence, but not for recommending category changes.

Rules for tier-aware category coaching:
- "3 of N competitors use this category" should reference IN-TIER counts unless explicitly noted otherwise.
- Don't add categories on the basis of cross-tier usage alone (e.g., don't add "Tile contractor" because Gilbert Tile uses it — Gilbert is a specialty trade, not your tier).
- Out-of-category competitor categories (e.g., Painting with a Twist's "Art studio") MUST be excluded from any category recommendations.

INPUTS YOU GET (treat each as a different signal):
- The business's currently-declared GBP categories (subscriber said this — preserves their signal even when imperfect)
- Their GBP self-description (their own voice on what they do)
- Brand DNA signals (TracPost's analysis of their actual content/voice)
- Top SERP competitors' full category lists partitioned into in-tier vs cross-tier frequency digests
- A relevant slice of the GBP gcid catalog you may pick from

CRITICAL RULES:

1. **NEVER INVENT GCIDS.** Only return gcids that appear in the inputs (current categories OR competitor categories OR the catalog slice). If a gcid isn't in the inputs, you don't have permission to use it.

2. **GBP allows at most 10 categories: 1 primary + 9 additional.** Your output must have exactly one entry with proposedPrimary=true, and 9 with proposedPrimary=false. Total: 10.

3. **PRIMARY category carries the most ranking weight.** Choose carefully. The current primary should USUALLY stay (don't churn) unless the competitive data strongly suggests a different primary would better-position the business.

4. **Cite SIGNAL in reasoning, not assertions. Frame competitor signal as "what's clearing the SERP bar," not as "what's best in this market."** Examples of good reasoning:
   - "3 of 10 SERP-ranking competitors use this category (L&C, Patina, Marvista). These aren't necessarily the best operators in the market — they're the ones who showed up online. Adding this puts you at the bar they cleared."
   - "Subscriber's GBP description mentions 'kitchen remodels' explicitly. Direct alignment."
   - "Brand DNA signals positioning on 'craftsmanship and material quality' — Custom home builder is consistent with that frame."
   Bad reasoning: "This is a good category" / "Adds variety" / "Most top contractors have this" / "L&C dominates with this category"

5. **Honor existing signal.** Categories the subscriber currently has should default to 'keep' unless competitive data shows they're irrelevant (zero SERP-competitor presence + no Brand DNA support). 'drop' should be rare and well-justified.

6. **Filter noise categories.** Some Google categories are taxonomy artifacts (e.g., 'establishment_service', 'point_of_interest_establishment'). Don't propose these.

7. **Skip non-competitor competitors AS COMPETITIVE SIGNAL.** If a SERP result is in an adjacent industry (e.g., paint-and-sip entertainment ranking on 'painting' queries), don't pull their categories into your plan — but note in reasoning when relevant that "even entertainment businesses outrank the subscriber on these queries" further demonstrates the bar is achievable.

8. **Confidence calibration (calibrated against the SERP bar, not against operational excellence):**
   - 0.85+ = strong cross-signal alignment (multiple SERP-ranking competitors + Brand DNA + subscriber declaration agree)
   - 0.6-0.85 = decent signal (one strong source or moderate convergence)
   - 0.4-0.6 = weak signal, exploratory inclusion to fill the 10-slot budget
   - <0.4 = don't include

9. **Subscriber-readable voice with confident tone.** Write reasoning a small business owner would understand. Opportunity frame, not anxiety frame — the bar is low, clearing it is achievable, you're showing them how. Avoid language that positions ranked competitors as superior operators.

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
 * Build a digest of competitor category frequency across a set of
 * competitors. This becomes the "battle-tested market signal" we feed
 * the LLM as a pre-computed table, reducing the work it has to do AND
 * the chance it miscounts.
 *
 * Called separately for in-tier vs cross-tier competitor subsets so
 * the prompt can present partitioned counts (per tier-partition rules).
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
 * Partition competitor categories into in-tier vs cross-tier subsets
 * based on subscriber's declared tier and per-competitor classifications
 * (resolved via tier2.cid → topCompetitor.placeId → topCompetitor.inferredTier).
 */
function partitionCompetitorCategoriesByTier(
  competitorCategories: CompetitorCategories[],
  topCompetitors: AnalysisPayload["topCompetitors"],
  subscriberTierSlug: string | null,
): { inTier: CompetitorCategories[]; crossTier: CompetitorCategories[]; tierByCid: Map<string, string | null> } {
  // Index competitor tiers by cid (which equals topCompetitor.placeId)
  const tierByCid = new Map<string, string | null>();
  for (const c of topCompetitors) {
    tierByCid.set(c.placeId, c.inferredTier?.tierSlug ?? null);
  }
  if (!subscriberTierSlug) {
    return { inTier: [], crossTier: competitorCategories, tierByCid };
  }
  const inTier: CompetitorCategories[] = [];
  const crossTier: CompetitorCategories[] = [];
  for (const cc of competitorCategories) {
    const cTier = tierByCid.get(cc.cid);
    if (cTier === subscriberTierSlug) inTier.push(cc);
    else crossTier.push(cc);
  }
  return { inTier, crossTier, tierByCid };
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

  // Tier-aware partition of competitor categories
  const subscriberTierSlug = analysis.subscriberTier?.slug ?? null;
  const subscriberTierLabel = analysis.subscriberTier?.label ?? null;
  const { inTier, crossTier } = partitionCompetitorCategoriesByTier(
    analysis.competitorCategories || [],
    analysis.topCompetitors || [],
    subscriberTierSlug,
  );
  const inTierFreq = Array.from(buildCompetitorFrequencyDigest(inTier).entries())
    .map(([gcid, v]) => ({ gcid, ...v }))
    .sort((a, b) => b.count - a.count);
  const crossTierFreq = Array.from(buildCompetitorFrequencyDigest(crossTier).entries())
    .map(([gcid, v]) => ({ gcid, ...v }))
    .sort((a, b) => b.count - a.count);

  // Gather the full gcid universe for "catalog slice" hint to the LLM —
  // every gcid that's currently on subscriber OR appeared on a competitor.
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
    inTierFreq,
    crossTierFreq,
    inTierCount: inTier.length,
    crossTierCount: crossTier.length,
    subscriberTierLabel,
    catalogSlice: catalogSlice as Array<{ gcid: string; name: string }>,
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

  // Implicit drops — categories currently held by the subscriber that
  // didn't make the new 10-best list. Apply removes these even though
  // the LLM didn't mark them with action='drop'. Surface explicitly so
  // operator/subscriber see the full removal set before confirming.
  const plannedGcids = new Set(categories.map((c) => c.gcid));
  const implicitlyDropped = currentCategories
    .filter((c) => !plannedGcids.has(c.gcid))
    .map((c) => ({ gcid: c.gcid, name: c.name, wasPrimary: c.isPrimary }));

  return {
    categories,
    summary: {
      keep: categories.filter((c) => c.action === "keep").length,
      add: categories.filter((c) => c.action === "add").length,
      drop: categories.filter((c) => c.action === "drop").length,
      implicitlyDropped,
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
  inTierFreq: Array<{ gcid: string; displayName: string; count: number; competitors: string[]; primaryCount: number }>;
  crossTierFreq: Array<{ gcid: string; displayName: string; count: number; competitors: string[]; primaryCount: number }>;
  inTierCount: number;
  crossTierCount: number;
  subscriberTierLabel: string | null;
  catalogSlice: Array<{ gcid: string; name: string }>;
}

function buildPrompt(a: PromptArgs): string {
  const lines: string[] = [];

  lines.push(`Business: ${a.siteName}`);
  if (a.subscriberTierLabel) {
    lines.push(`Declared commercial tier: ${a.subscriberTierLabel}\n`);
  } else {
    lines.push("Declared commercial tier: NOT SET — partition rules degrade; treat all competitors as ambient.\n");
  }

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

  lines.push(`=== IN-TIER COMPETITOR CATEGORY FREQUENCY (across ${a.inTierCount} ${a.subscriberTierLabel ? `${a.subscriberTierLabel} ` : ""}competitors) ===`);
  lines.push("PRIMARY SIGNAL. Sorted by appearance count. primaryCount = how many lead with this category.");
  lines.push("These competitors share the subscriber's tier — use their category usage to inform keep/add decisions.\n");
  if (a.inTierFreq.length === 0) {
    lines.push("  (no in-tier competitors had category data — coaching relies on subscriber declarations + Brand DNA only)\n");
  } else {
    for (const e of a.inTierFreq) {
      lines.push(`  ${e.count}/${a.inTierCount}  [primary on ${e.primaryCount}]  ${e.gcid}  →  ${e.displayName}`);
      lines.push(`     used by: ${e.competitors.join(", ")}`);
    }
  }
  lines.push("");

  lines.push(`=== CROSS-TIER AMBIENT CATEGORY FREQUENCY (across ${a.crossTierCount} cross-tier competitors) ===`);
  lines.push("AMBIENT ONLY — do not weight these as reasons to add/drop categories.");
  lines.push("Categories appearing only here belong to specialty trades, scale operators, or out-of-category businesses.\n");
  if (a.crossTierFreq.length === 0) {
    lines.push("  (no cross-tier competitors)\n");
  } else {
    for (const e of a.crossTierFreq) {
      lines.push(`  ${e.count}/${a.crossTierCount}  ${e.gcid}  →  ${e.displayName}`);
      lines.push(`     used by: ${e.competitors.join(", ")}`);
    }
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
  lines.push("Cite specific signal in every `reasoning` field — IN-TIER competitor names + counts, brand DNA traits, description phrases.");
  lines.push("Never cite cross-tier competitors as reasons to keep/add — they're ambient only.");

  return lines.join("\n");
}

/**
 * Convenience wrapper: load all inputs for a site, run coaching, return result.
 * Throws if the β rule is violated (no completed CMA exists for this site).
 */
export async function coachCategoriesForSite(siteId: string): Promise<CoachingResult> {
  const [site] = await sql`
    SELECT
      s.id, s.name,
      s.gbp_profile->>'description' AS gbp_description,
      ct.slug AS tier_slug,
      ct.label AS tier_label,
      (SELECT JSON_AGG(JSON_BUILD_OBJECT('gcid', gc.gcid, 'name', gc.name, 'isPrimary', sgc.is_primary))
       FROM business_gbp_categories sgc JOIN gbp_categories gc ON gc.gcid = sgc.gcid
       WHERE sgc.business_id = ${siteId}) AS current_categories
    FROM businesses s LEFT JOIN commercial_tiers ct ON ct.id = s.commercial_tier_id
    WHERE s.id = ${siteId}
  `;
  if (!site) throw new Error(`Site ${siteId} not found`);

  const [cma] = await sql`
    SELECT id, analysis_data
    FROM competitive_market_analyses
    WHERE business_id = ${siteId} AND status = 'complete'
    ORDER BY generated_at DESC LIMIT 1
  `;
  if (!cma) {
    throw new Error(
      `No completed competitive market analysis exists for site ${siteId}. ` +
        `Category coaching requires CMA data (β rule). Run the CMA first.`,
    );
  }

  // Refresh subscriber tier from current sites state — analysis snapshot
  // may pre-date tier assignment or subscriber may have changed tier.
  const payload = cma.analysis_data as AnalysisPayload;
  if (site.tier_slug) {
    payload.subscriberTier = { slug: site.tier_slug as string, label: site.tier_label as string };
  } else {
    payload.subscriberTier = null;
  }

  return generateCategoryCoaching({
    siteId,
    siteName: site.name as string,
    currentCategories: (site.current_categories || []) as CoachingInputs["currentCategories"],
    gbpDescription: (site.gbp_description as string) || null,
    // Phase B: brand_dna no longer exists; category-coaching gets null until
    // it migrates to consume brand_descriptor.declared directly.
    brandDna: null,
    analysis: payload,
    analysisId: cma.id as string,
  });
}

/**
 * Tag each coached category with the intent cluster_ids it serves.
 *
 * Deterministic post-processor — no LLM call. For each output category,
 * walk every cluster's observed_category_frequencies and check whether
 * the category's gcid appears with STRONG enough frequency. If so, the
 * category is tagged with that cluster_id.
 *
 * The M:N junction binder uses these cluster_ids to wire
 * service_gbp_categories rows: a service tagged with cluster X binds
 * to every category also tagged with cluster X.
 *
 * THRESHOLD (2-of-2 rule, EITHER condition is sufficient):
 *   1. The category appears for at least HALF of the cluster's
 *      observed competitors. Majority-signal floor.
 *   2. The category is in the TOP-3 most-frequent categories for that
 *      cluster. Captures the strongest signal even when no category
 *      crosses the majority floor (rare-cluster small-sample case).
 *
 * Initial v1 used count > 0 — too loose, produced over-bound services
 * (a single bathroom service anchored to 9 categories because a few
 * incidental "1-competitor" categories slipped through).
 *
 * Per [[services-pipeline-doctrine]] (second-pass refinement 2026-06-16).
 */
export function tagCoachedCategoriesWithClusters(
  categories: CoachedCategory[],
  clusters: IntentCluster[],
): CoachedCategory[] {
  if (clusters.length === 0) {
    return categories.map((c) => ({ ...c, cluster_ids: [] }));
  }

  // Pre-compute, per cluster, the set of gcids that pass the threshold.
  const clusterServedGcids = new Map<string, Set<string>>();
  for (const cluster of clusters) {
    const served = new Set<string>();
    const competitorCount = cluster.observed_competitor_place_ids.length;
    const majorityFloor = Math.max(1, Math.ceil(competitorCount / 2));
    const topN = cluster.observed_category_frequencies.slice(0, 3);

    for (const freq of cluster.observed_category_frequencies) {
      const passesMajority = freq.count >= majorityFloor;
      const passesTopN = topN.some((t) => t.gcid === freq.gcid);
      if (passesMajority || passesTopN) {
        served.add(freq.gcid);
      }
    }
    clusterServedGcids.set(cluster.cluster_id, served);
  }

  return categories.map((cat) => {
    const cluster_ids: string[] = [];
    for (const [cid, served] of clusterServedGcids) {
      if (served.has(cat.gcid)) cluster_ids.push(cid);
    }
    return { ...cat, cluster_ids };
  });
}
