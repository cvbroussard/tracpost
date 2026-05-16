#!/usr/bin/env node
/**
 * Operator script: regenerate LLM recommendations against an existing
 * competitive market analysis. Cheap — no SerpAPI fetch, just one
 * Anthropic Haiku call against the persisted analysis_data payload.
 *
 * Useful for iterating on the recommendations prompt without burning
 * SERP credits.
 *
 * Usage:
 *   node scripts/generate-cma-recommendations.js <site_id>
 *
 * Cost: ~$0.005 per call (Haiku 4.5).
 */
const { neon } = require("@neondatabase/serverless");
const Anthropic = require("@anthropic-ai/sdk").default;
require("dotenv").config({ path: ".env.local" });

const SITE_ID = process.argv[2];
if (!SITE_ID) {
  console.error("Usage: node scripts/generate-cma-recommendations.js <site_id>");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sql = neon(process.env.DATABASE_URL);

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

function formatCompetitor(index, c) {
  const lines = [];
  lines.push(`${index}. ${c.title}`);
  lines.push(`   type: ${c.type || "?"} | rating: ${c.rating ?? "?"} (${c.reviewsCount ?? 0} reviews) | appearances: ${c.appearanceCount} | avg position: ${c.averagePosition.toFixed(1)} | score: ${c.score.toFixed(2)}`);
  if (c.website) lines.push(`   website: ${c.website}`);
  if (c.address) lines.push(`   address: ${c.address}`);
  lines.push(`   appeared in:`);
  for (const a of c.appearedInQueries) {
    lines.push(`     - [${a.weight}] "${a.query}" → position ${a.position}`);
  }
  return lines.join("\n");
}

function buildSnapshot(payload, count) {
  const lines = [];
  lines.push("=== SUBSCRIBER PROFILE ===\n");
  lines.push("GBP Categories:");
  for (const c of payload.subscriberCategories) {
    lines.push(`  - ${c.name}${c.isPrimary ? " [PRIMARY]" : ""}`);
  }
  lines.push("\nService areas:");
  for (const a of payload.subscriberServiceAreas) {
    lines.push(`  - ${a.placeName}`);
  }
  lines.push(`\n=== TARGET QUERIES (${payload.targetQueries.length} run) ===\n`);
  for (const q of payload.targetQueries) {
    lines.push(`  [${q.weight}] "${q.query}"`);
  }
  lines.push(`\n=== RANKING COMPETITORS (${payload.topCompetitors.length} captured, ${payload.totalCompetitorsObserved} total) ===\n`);
  for (let i = 0; i < payload.topCompetitors.length; i++) {
    lines.push(formatCompetitor(i + 1, payload.topCompetitors[i]));
  }
  lines.push(`\n=== ASK ===\n`);
  lines.push(`Return the top ${count} most impactful, actionable recommendations as a JSON array.`);
  lines.push(`Each recommendation must have: { kind, title, message, priority, reasoning, actionability }.`);
  lines.push(`kind options: category_gap, category_alignment, review_velocity, rating_gap, competitor_watch, non_competitor_filter, geographic_gap, category_dominance, service_offering, general.`);
  lines.push(`priority options: high, medium, low.`);
  return lines.join("\n");
}

async function run() {
  const [row] = await sql`
    SELECT id, analysis_data FROM competitive_market_analyses
    WHERE site_id = ${SITE_ID} AND status = 'complete'
    ORDER BY generated_at DESC LIMIT 1
  `;
  if (!row) {
    console.error("No completed analysis found for this site");
    process.exit(1);
  }
  const payload = row.analysis_data;
  console.log(`Generating recommendations against analysis ${row.id}...`);
  console.log(`  Competitors in payload: ${payload.topCompetitors.length}`);

  const userMessage = buildSnapshot(payload, 4);
  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    console.error("LLM returned no JSON array");
    console.log("Raw response:", text);
    process.exit(1);
  }

  const recommendations = JSON.parse(match[0]);
  console.log(`\n✓ Generated ${recommendations.length} recommendations\n`);

  recommendations.forEach((r, i) => {
    const priorityIcon = r.priority === "high" ? "🔴" : r.priority === "medium" ? "🟡" : "🟢";
    console.log(`${priorityIcon} ${i + 1}. ${r.title}  [${r.kind}]`);
    console.log(`   ${r.message}`);
    console.log(`   ─ Why: ${r.reasoning}`);
    console.log(`   ─ Do:  ${r.actionability}`);
    console.log();
  });

  // Persist back to the analysis row
  payload.recommendations = recommendations;
  await sql`
    UPDATE competitive_market_analyses
    SET analysis_data = ${JSON.stringify(payload)}::jsonb, updated_at = NOW()
    WHERE id = ${row.id}
  `;
  console.log(`✓ Recommendations persisted to analysis ${row.id}`);
}

run().catch((err) => { console.error(err); process.exit(1); });
