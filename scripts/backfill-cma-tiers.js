#!/usr/bin/env node
/**
 * Operator script: backfill commercial-tier classifications on an existing
 * CMA's top competitors. Uses Tier 2 categories + SerpAPI signals already
 * present in the payload (no SerpAPI cost). Persists inferredTier per
 * topCompetitor.
 *
 * Usage:
 *   node scripts/backfill-cma-tiers.js <site_id>
 *
 * Cost: ~$0.001 × topCompetitors.length (~$0.01 for top 10).
 */
const { neon } = require("@neondatabase/serverless");
const Anthropic = require("@anthropic-ai/sdk").default;
require("dotenv").config({ path: ".env.local" });

const SITE_ID = process.argv[2];
if (!SITE_ID) {
  console.error("Usage: node scripts/backfill-cma-tiers.js <site_id>");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sql = neon(process.env.DATABASE_URL);

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
   - 0.85+ = signals strongly converge on one tier
   - 0.6-0.85 = signals point clearly, some ambiguity
   - 0.4-0.6 = weak signal, best-guess classification
   - <0.4 = essentially guessing

5. **Reasoning should be 1-2 sentences max**, citing the specific signals.

OUTPUT: Return ONLY a JSON object:
{
  "tierSlug": "exact_slug_from_list",
  "confidence": 0.0-1.0,
  "reasoning": "brief signal-citing explanation"
}

No prose preamble, no markdown code fences. Strict JSON.`;

async function classify(competitor, tier2, tiers, labelByslug) {
  const lines = [];
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
  if (competitor.yearsInBusiness) lines.push(`Years in business: ${competitor.yearsInBusiness}`);
  if (competitor.description) lines.push(`Description: ${competitor.description}`);
  if (tier2 && tier2.displayNames?.length > 0) {
    lines.push(`GBP categories (${tier2.displayNames.length}): ${tier2.displayNames.join(", ")}`);
  }
  lines.push("\n=== ASK ===\n");
  lines.push("Classify this business into exactly one tier. Return the JSON object.");

  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: lines.join("\n") }],
    });
    const text = res.content[0].type === "text" ? res.content[0].text : "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("no JSON");
    const parsed = JSON.parse(match[0]);
    if (!labelByslug.has(parsed.tierSlug)) throw new Error(`invalid slug: ${parsed.tierSlug}`);
    return {
      tierSlug: parsed.tierSlug,
      tierLabel: labelByslug.get(parsed.tierSlug),
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
    };
  } catch (err) {
    console.warn(`  ! ${competitor.title}: ${err.message}`);
    return {
      tierSlug: "mid_size_operator",
      tierLabel: labelByslug.get("mid_size_operator"),
      confidence: 0.2,
      reasoning: "Classification failed — defaulted to mid-size.",
    };
  }
}

async function run() {
  const tiers = await sql`SELECT slug, label, description, is_target FROM commercial_tiers ORDER BY display_order ASC`;
  const labelByslug = new Map(tiers.map((t) => [t.slug, t.label]));

  const [row] = await sql`
    SELECT id, analysis_data FROM competitive_market_analyses
    WHERE site_id = ${SITE_ID} AND status = 'complete'
    ORDER BY generated_at DESC LIMIT 1
  `;
  if (!row) { console.error("No completed analysis for site"); process.exit(1); }

  const payload = row.analysis_data;
  const top = payload.topCompetitors || [];
  const tier2Map = new Map((payload.competitorCategories || []).map((c) => [c.cid, c]));

  console.log(`Backfilling tier classifications for analysis ${row.id}`);
  console.log(`  ${top.length} top competitors`);
  console.log(`  ${tier2Map.size} have Tier 2 categories\n`);

  const results = await Promise.all(
    top.map(async (c) => {
      const tier = await classify(c, tier2Map.get(c.placeId), tiers, labelByslug);
      c.inferredTier = tier;
      return tier;
    }),
  );

  await sql`
    UPDATE competitive_market_analyses
    SET analysis_data = ${JSON.stringify(payload)}::jsonb, updated_at = NOW()
    WHERE id = ${row.id}
  `;

  console.log(`✓ Patched ${results.length} classifications onto analysis ${row.id}\n`);

  console.log(`=== CLASSIFICATION RESULTS ===\n`);
  for (let i = 0; i < top.length; i++) {
    const c = top[i];
    const t = c.inferredTier;
    const tag = t.tierSlug === "mid_size_operator" || t.tierSlug === "small_crew" || t.tierSlug === "boutique_specialty"
      ? "● TARGET" : "  cross-tier";
    const confBars = "▓".repeat(Math.round(t.confidence * 10)) + "░".repeat(10 - Math.round(t.confidence * 10));
    console.log(`${(i + 1).toString().padStart(2)}. ${tag.padEnd(13)} ${t.tierLabel.padEnd(28)} ${confBars} ${(t.confidence * 100).toFixed(0)}%`);
    console.log(`    ${c.title}  (${c.type || "?"}, ${c.reviewsCount ?? "?"} reviews)`);
    console.log(`    ${t.reasoning}\n`);
  }
}

run().catch((err) => { console.error(err); process.exit(1); });
