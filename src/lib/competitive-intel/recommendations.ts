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

CRITICAL RULES:
1. Be SPECIFIC — cite competitor names, review counts, query positions, exact category names. Generic advice ("get more reviews") is worthless. Specific advice ("L&C Builders has 26 reviews and dominates 9 of your 15 queries — your 12 reviews are the #1 SEO lever to fix") earns trust.
2. Flag CATEGORY MISMATCHES — sometimes a ranked competitor isn't actually a competitor (e.g., an entertainment-painting studio ranking for "painting contractor" searches). Surface these as "non_competitor_filter" recommendations so the subscriber knows we're not blindly counting noise.
3. Prioritize by IMPACT, not difficulty — a "high" priority recommendation should be one that, if acted on, would meaningfully close the rank gap.
4. Recommendations must be subscriber-readable, NOT engineering jargon. Write like a strategist talking to a business owner.
5. ALWAYS include a "what to do" — every recommendation has an actionability field with a concrete next action.
6. Cite the DATA explicitly in the reasoning — "3 of 10 top competitors are tagged as 'X', you're tagged as 'Y'" earns trust by being verifiable.
7. Avoid filler. If only 3 strong recommendations exist, return 3 — don't pad to hit the count.

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

  lines.push(`=== RANKING COMPETITORS (${payload.topCompetitors.length} captured, ${payload.totalCompetitorsObserved} total observed) ===\n`);
  for (let i = 0; i < payload.topCompetitors.length; i++) {
    const c = payload.topCompetitors[i];
    lines.push(formatCompetitor(i + 1, c));
  }
  lines.push("");

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
