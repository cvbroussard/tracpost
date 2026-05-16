/**
 * LLM-driven commercial tier classifier for SERP competitors.
 *
 * Each top-N competitor in a CMA gets classified into one of the 7
 * canonical tiers (3 target + 4 CMA-only). The classifier reads
 * available signals (review count, GBP categories, Tier 2 category set,
 * SERP type label, address presence, etc.) and returns a tier slug
 * with confidence + reasoning.
 *
 * Subscriber's site tier is subscriber-declared (the lever, per
 * project_tracpost_tier_model.md). Competitor tiers are inferred —
 * different problem, lower stakes (filter not judgment).
 *
 * Used by analysis-assembly to partition topCompetitors into
 * inTierCompetitors (matching subscriber's tier) vs crossTierContext
 * (everything else). Recommendations and coaching prompts receive
 * the partition separately, with different framing rules per set.
 *
 * Why Haiku 4.5 for V1: cheap (~$0.001/classification), fast (~1-2s),
 * structured-output capable. Per-CMA cost: ~$0.01 for top 10.
 */
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { EnrichedCompetitor } from "./analysis-assembly";
import type { CompetitorCategories } from "./serp-fetch";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ClassifiedTier {
  /** Stable tier slug from commercial_tiers.slug (e.g., "mid_size_operator") */
  tierSlug: string;
  /** Human-readable label from commercial_tiers.label */
  tierLabel: string;
  /** 0-1 confidence — how much signal supported this classification */
  confidence: number;
  /** Brief signal-citing reasoning (operator visibility / debug) */
  reasoning: string;
}

interface TierDefinition {
  slug: string;
  label: string;
  description: string;
  is_target: boolean;
}

let cachedTiers: TierDefinition[] | null = null;

async function loadTiers(): Promise<TierDefinition[]> {
  if (cachedTiers) return cachedTiers;
  const rows = await sql`
    SELECT slug, label, description, is_target
    FROM commercial_tiers
    ORDER BY display_order ASC
  `;
  cachedTiers = rows as TierDefinition[];
  return cachedTiers;
}

const SYSTEM_PROMPT = `You are TracPost's commercial tier classifier. Given signals about a business that appears on a SERP, classify it into exactly one of the canonical commercial tiers.

The tier reflects COMPETITIVE STRUCTURE (headcount band, geographic scope, clientele type, positioning) — NOT industry, NOT operational quality. Two businesses in different industries with similar structure share a tier.

CRITICAL RULES:

1. **Return EXACTLY one tier slug** from the canonical list provided. Never invent slugs.

2. **Use only signals present in the input.** If signals are sparse, lean toward the most common tier for the visible signals (typically "mid_size_operator" or "below_target" for contractor SERPs) and lower your confidence accordingly.

3. **Common heuristics (but think holistically):**
   - Review count is a rough volume proxy: <20 often signals below_target; 20-80 often signals small_crew or mid_size; 80-200+ often signals mid_size or above_target
   - SERP "type" labels matter: "General contractor" / "Construction company" suggest target-range; "Painting studio" / "Art studio" / "Event venue" signal out_of_category
   - Narrow category sets (1-3 categories, single-trade) suggest specialty_trade
   - Premium positioning language (design firm, architect-led, boutique) suggests boutique_specialty
   - Names with multiple location indicators or "Inc" / corporate styling suggest above_target

4. **Confidence calibration:**
   - 0.85+ = signals strongly converge on one tier (rare for sparse data)
   - 0.6-0.85 = signals point clearly, some ambiguity
   - 0.4-0.6 = weak signal, best-guess classification
   - <0.4 = essentially guessing — return your best guess at lower confidence rather than refusing

5. **Reasoning should be 1-2 sentences max**, citing the specific signals that drove the choice. Operator may read these to debug or override.

OUTPUT: Return ONLY a JSON object with the shape:
{
  "tierSlug": "exact_slug_from_list",
  "confidence": 0.0-1.0,
  "reasoning": "brief signal-citing explanation"
}

No prose preamble, no markdown code fences. Strict JSON.`;

function buildClassificationPrompt(
  competitor: EnrichedCompetitor,
  tier2: CompetitorCategories | undefined,
  tiers: TierDefinition[],
): string {
  const lines: string[] = [];

  lines.push("=== CANONICAL TIERS ===\n");
  for (const t of tiers) {
    lines.push(`${t.slug}${t.is_target ? "  [TracPost target]" : ""}`);
    lines.push(`  ${t.description}`);
    lines.push("");
  }

  lines.push("=== BUSINESS TO CLASSIFY ===\n");
  lines.push(`Name: ${competitor.title}`);
  lines.push(`SERP type label: ${competitor.type || "unknown"}`);
  lines.push(`Reviews: ${competitor.reviewsCount ?? "unknown"}`);
  lines.push(`Rating: ${competitor.rating ?? "unknown"}`);
  if (competitor.address) lines.push(`Address: ${competitor.address}`);
  if (competitor.website) lines.push(`Website: ${competitor.website}`);
  if (tier2 && tier2.displayNames.length > 0) {
    lines.push(`GBP categories (${tier2.displayNames.length}): ${tier2.displayNames.join(", ")}`);
  }
  lines.push("");
  lines.push("=== ASK ===\n");
  lines.push("Classify this business into exactly one tier. Return the JSON object.");

  return lines.join("\n");
}

/**
 * Classify a single competitor's tier. Returns a low-confidence fallback
 * (mid_size_operator @ 0.2) if the LLM call fails or returns malformed
 * output — never throws. Caller can persist the classification regardless
 * and use confidence to inform whether the recommendations should weight
 * this competitor heavily.
 */
export async function classifyCompetitorTier(
  competitor: EnrichedCompetitor,
  tier2: CompetitorCategories | undefined = undefined,
): Promise<ClassifiedTier> {
  const tiers = await loadTiers();
  const labelByslug = new Map(tiers.map((t) => [t.slug, t.label]));
  const userMessage = buildClassificationPrompt(competitor, tier2, tiers);

  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    });
    const text = res.content[0].type === "text" ? res.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object in response");
    const parsed = JSON.parse(match[0]) as Omit<ClassifiedTier, "tierLabel">;
    if (!labelByslug.has(parsed.tierSlug)) {
      throw new Error(`Invalid tier slug returned: ${parsed.tierSlug}`);
    }
    return {
      tierSlug: parsed.tierSlug,
      tierLabel: labelByslug.get(parsed.tierSlug)!,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    };
  } catch (err) {
    console.warn(
      `Tier classification failed for ${competitor.title}:`,
      err instanceof Error ? err.message : err,
    );
    return {
      tierSlug: "mid_size_operator",
      tierLabel: labelByslug.get("mid_size_operator") ?? "Mid-size operator",
      confidence: 0.2,
      reasoning: "Classification failed — defaulted to mid-size; confidence low.",
    };
  }
}

/**
 * Classify a batch of competitors in parallel. Same fallback semantics
 * as single classification — failures yield low-confidence defaults
 * rather than throwing.
 */
export async function classifyCompetitors(
  competitors: EnrichedCompetitor[],
  tier2Map: Map<string, CompetitorCategories>,
): Promise<Map<string, ClassifiedTier>> {
  const results = await Promise.all(
    competitors.map(async (c) => {
      const tier2 = tier2Map.get(c.placeId);
      const tier = await classifyCompetitorTier(c, tier2);
      return [c.placeId, tier] as const;
    }),
  );
  return new Map(results);
}
