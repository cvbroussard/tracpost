/**
 * LLM-driven recommendation engine for the competitive market analysis.
 *
 * Takes the raw AnalysisPayload (categories, service areas, ranked
 * competitors) and produces 3-5 specific, actionable recommendations
 * with citation-style reasoning. This is what transforms the raw
 * SerpAPI data into a coaching artifact — the part that justifies
 * "agency-grade first deliverable" positioning.
 *
 * Why Haiku 4.5 for V1: cheap (~$0.005/analysis), fast (~2-4s),
 * strong at structured output. Quality bar may push us to Opus per
 * tier later if the reasoning isn't crisp enough.
 *
 * Pure function — takes the payload, returns recommendations.
 * Doesn't write to DB. Caller persists alongside the analysis.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisPayload, EnrichedCompetitor } from "./analysis-assembly";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export type RecommendationKind =
  | "category_gap" // Competitors use categories you don't
  | "category_alignment" // Your primary doesn't match the market
  | "review_velocity" // You're behind on review count
  | "rating_gap" // Your rating is below competitive set
  | "competitor_watch" // A specific competitor warrants close attention
  | "non_competitor_filter" // Filter out a ranked result that isn't actually a competitor
  | "geographic_gap" // You don't show up in an area you serve
  | "category_dominance" // You're competing strong in a specific category
  | "service_offering" // Missing service offerings competitors have
  | "general"; // Catch-all

export interface Recommendation {
  kind: RecommendationKind;
  title: string;
  message: string;
  priority: "high" | "medium" | "low";
  reasoning: string;
  actionability: string;
}

export interface RecommendationOptions {
  /** Target number of recommendations. Default 4. */
  count?: number;
}

const SYSTEM_PROMPT = `You are TracPost's competitive market analyst. You produce the FIRST DELIVERABLE that subscribers see — the equivalent of a local SEO agency's opening competitive analysis.

The subscriber has just connected their Google Business Profile. You've run real Google searches against the queries that matter to them and identified who actually outranks them. Your job: surface the 3-5 highest-impact, most ACTIONABLE recommendations.

MARKET CONTEXT (internalize this before writing — it shapes voice and framing):

The businesses ranking on these SERPs are NOT typically the capability leaders in this market. They are mid-to-bottom-tier operators who happen to do basic SEO + GBP hygiene at a moderate level. The actually-best operators in the subscriber's geo are usually invisible to digital channels — they win via referrals, reputation, and offline networks. The SERP rewards online hygiene; it does NOT measure operational excellence.

Three implications for how you write:

a. **Don't position competitors as aspirational standards.** They're evidence of how LOW the bar is — moderate-tier operators clearing it because most operators didn't bother. Prefer "L&C ranks despite being a moderate-tier operator" over "L&C dominates."

b. **Opportunity frame, not anxiety frame.** Subscriber feeling "I'm a quality operator and mediocre competitors are eating my lunch" should leave this analysis thinking "the bar is lower than I assumed, and I can clear it systematically." Recommendations should radiate confidence in the achievability of the lift.

c. **Non-competitor SERP results are STRONG evidence of a low bar, not noise to dismiss.** When entertainment businesses or adjacent-industry results rank, that's the loudest possible signal that the SERP rewards hygiene over fit. Name it explicitly.

TIER PARTITION (read carefully — load-bearing):

The subscriber has declared their commercial tier. Competitors in the SERP have been classified into commercial tiers too. The snapshot below shows TWO sets:

  - **In-tier competitive set** — operators that share the subscriber's tier. These are the peers the subscriber chose to compete against. Reasoning, comparisons, and metrics should weight these heavily.

  - **Cross-tier ambient context** — operators in different commercial tiers (smaller, larger, specialty trades, out-of-category). They appear on the SERP but compete for different clientele. NEVER treat them as peers or benchmarks. Use them only as ambient evidence of SERP dynamics (e.g., "even an out-of-category business outranks you here — proves the bar is achievable").

Rules for working with the partition:
  - Primary signal: in-tier set. Counts, comparisons, "X of N competitors" should reference in-tier unless explicitly noted otherwise.
  - Cross-tier mentions: only when relevant (anti-pattern outliers, bar-evidence). Frame as "operators outside your tier" or by their specific tier label, NEVER as peers.
  - Don't equate the subscriber to cross-tier operators in language or metrics.

CRITICAL RULES (read carefully — violations destroy trust):

1. **NEVER INVENT NUMBERS.** Use ONLY data present in the analysis snapshot below. If a metric is missing (rating, review count, etc.), say "unknown" or omit the recommendation. Better to skip a recommendation than fabricate a value.

2. **Be SPECIFIC** — when data is present, cite real values: competitor names from the snapshot, exact review counts shown, exact query positions, exact category names. Generic advice ("get more reviews") is worthless without supporting data; specific advice citing snapshot values earns trust.

3. **Treat non-competitors as low-bar evidence, not noise.** When a cross-tier result is clearly out-of-category (entertainment business on contractor queries, etc.), don't just filter it — name it as proof the bar is achievable. Surface via "non_competitor_filter" kind with framing like "even [type] outranks you on [query] — clearing this bar is about consistent presence and hygiene, not about beating capable competitors."

4. **Prioritize by IMPACT, not difficulty** — a "high" priority recommendation should be one that, if acted on, would meaningfully close the rank gap. The lifts are achievable — say so.

5. **Subscriber-readable voice with confident tone.** Write like a strategist talking to a business owner. The undercurrent: "you're better than these ranked operators, and we're going to make that visible." Avoid anxious or apologetic language.

6. **ALWAYS include "what to do"** — every recommendation has an actionability field with a concrete next action.

7. **Cite the DATA explicitly in the reasoning** — patterns like "X of N in-tier competitors are tagged as <category>, you're tagged as <other>" earn trust by being verifiable against the snapshot.

8. **Avoid filler** — if only 3 strong recommendations exist, return 3. Don't pad.

OUTPUT: Return ONLY a JSON array of recommendation objects. No prose preamble, no markdown code fences. Strict JSON.`;

export async function generateRecommendations(
  payload: AnalysisPayload,
  opts: RecommendationOptions = {},
): Promise<Recommendation[]> {
  const count = opts.count ?? 4;

  // Build the analysis snapshot for the LLM
  const userMessage = buildAnalysisSnapshot(payload, count);

  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    console.warn("LLM returned no JSON array in recommendations response");
    return [];
  }

  try {
    const parsed = JSON.parse(match[0]) as Recommendation[];
    return parsed.slice(0, count); // hard-cap in case the LLM over-generates
  } catch (err) {
    console.warn("Failed to parse recommendations JSON:", err instanceof Error ? err.message : err);
    return [];
  }
}

function buildAnalysisSnapshot(payload: AnalysisPayload, count: number): string {
  const lines: string[] = [];

  lines.push("=== SUBSCRIBER PROFILE ===\n");

  // Subscriber metrics block — REAL data the LLM can cite. If a field
  // is null, that's a fact too ("unknown") and the LLM should NOT
  // invent a value.
  const m = payload.subscriberMetrics;
  lines.push("Subscriber's own GBP metrics (real data — cite these, never invent):");
  lines.push(`  - Google rating: ${m.rating !== null ? m.rating.toFixed(1) : "unknown"}`);
  lines.push(`  - Google review count: ${m.reviewCount !== null ? m.reviewCount : "unknown"}`);
  lines.push(`  - GBP completeness score: ${m.completenessScore !== null ? `${m.completenessScore}/100` : "unknown"}`);
  if (m.completenessMissing.length > 0) {
    lines.push(`  - GBP fields missing: ${m.completenessMissing.join(", ")}`);
  }
  lines.push(`  - Has website: ${m.hasWebsite ? "yes" : "no"}`);
  lines.push(`  - Has phone: ${m.hasPhone ? "yes" : "no"}`);
  lines.push(`  - Has street address on GBP: ${m.hasAddress ? "yes" : "no (service-area business)"}`);
  lines.push(`  - Social profile URLs declared: ${m.socialProfileCount}`);
  lines.push(`  - GBP categories declared: ${m.categoryCount}`);
  lines.push(`  - Service areas declared: ${m.serviceAreaCount}`);
  lines.push("");

  // Subscriber's declared commercial tier — drives the in-tier vs
  // cross-tier partition below. If null, the LLM gets the full set
  // un-partitioned (pre-tier-model behavior).
  if (payload.subscriberTier) {
    lines.push(`Subscriber's declared commercial tier: ${payload.subscriberTier.label} (slug: ${payload.subscriberTier.slug})`);
    lines.push(`This is the peer group the subscriber chose. Use it to partition competitors below.`);
  } else {
    lines.push(`Subscriber commercial tier: NOT DECLARED — treat all competitors as ambient SERP context, not peers.`);
  }
  lines.push("");

  lines.push("GBP Categories (subscriber's declared service taxonomy):");
  for (const c of payload.subscriberCategories) {
    lines.push(`  - ${c.name}${c.isPrimary ? " [PRIMARY]" : ""}`);
  }
  lines.push("");
  lines.push("Service areas (where subscriber says they serve):");
  for (const a of payload.subscriberServiceAreas) {
    lines.push(`  - ${a.placeName}`);
  }
  lines.push("");

  lines.push(`=== TARGET QUERIES (${payload.targetQueries.length} run) ===\n`);
  for (const q of payload.targetQueries) {
    lines.push(`  [${q.weight}] "${q.query}"`);
  }
  lines.push("");

  // Partition competitors by tier match. Subscriber's tier slug
  // determines what counts as "in-tier."
  const subscriberSlug = payload.subscriberTier?.slug || null;
  const inTier = subscriberSlug
    ? payload.topCompetitors.filter((c) => c.inferredTier?.tierSlug === subscriberSlug)
    : [];
  const crossTier = subscriberSlug
    ? payload.topCompetitors.filter((c) => c.inferredTier?.tierSlug !== subscriberSlug)
    : payload.topCompetitors;

  lines.push(`=== IN-TIER COMPETITIVE SET (${inTier.length} of ${payload.topCompetitors.length}) ===`);
  if (subscriberSlug) {
    lines.push(`These are operators classified into the subscriber's tier (${payload.subscriberTier!.label}).`);
    lines.push(`Reasoning, comparisons, and "X of N" counts should reference THIS set primarily.\n`);
  } else {
    lines.push(`Subscriber tier not declared — in-tier set is empty. All competitors fall into ambient context below.\n`);
  }
  if (inTier.length === 0) {
    lines.push("  (no in-tier competitors in the top results)\n");
  } else {
    for (let i = 0; i < inTier.length; i++) {
      lines.push(formatCompetitor(i + 1, inTier[i]));
    }
  }
  lines.push("");

  lines.push(`=== CROSS-TIER AMBIENT CONTEXT (${crossTier.length} of ${payload.topCompetitors.length}) ===`);
  lines.push(`These operators appear on the SERP but compete in different commercial tiers.`);
  lines.push(`NOT peers — do not equate the subscriber to them. Reference only as ambient signal`);
  lines.push(`(out-of-category outranking = bar evidence; specialty trades = not chasing same clientele).\n`);
  if (crossTier.length === 0) {
    lines.push("  (no cross-tier competitors)\n");
  } else {
    for (let i = 0; i < crossTier.length; i++) {
      const tierLabel = crossTier[i].inferredTier?.tierLabel ?? "unclassified";
      lines.push(`[Cross-tier: ${tierLabel}]`);
      lines.push(formatCompetitor(i + 1, crossTier[i]));
    }
  }
  lines.push("");

  lines.push(`Total observed across all queries: ${payload.totalCompetitorsObserved} businesses\n`);

  lines.push("=== ASK ===\n");
  lines.push(`Return the top ${count} most impactful, actionable recommendations as a JSON array.`);
  lines.push(`Each recommendation must have: { kind, title, message, priority, reasoning, actionability }.`);
  lines.push(`kind options: category_gap, category_alignment, review_velocity, rating_gap, competitor_watch, non_competitor_filter, geographic_gap, category_dominance, service_offering, general.`);
  lines.push(`priority options: high, medium, low.`);

  return lines.join("\n");
}

function formatCompetitor(index: number, c: EnrichedCompetitor): string {
  const lines: string[] = [];
  lines.push(`${index}. ${c.title}`);
  lines.push(`   type: ${c.type || "?"} | rating: ${c.rating ?? "?"} (${c.reviewsCount ?? 0} reviews) | appearances: ${c.appearanceCount}/${c.appearedInQueries[0] ? "queries" : "?"} | avg position: ${c.averagePosition.toFixed(1)} | score: ${c.score.toFixed(2)}`);
  if (c.website) lines.push(`   website: ${c.website}`);
  if (c.address) lines.push(`   address: ${c.address}`);
  lines.push(`   appeared in:`);
  for (const a of c.appearedInQueries) {
    lines.push(`     - [${a.weight}] "${a.query}" → position ${a.position}`);
  }
  return lines.join("\n");
}
