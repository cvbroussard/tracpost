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

3. **Treat non-competitors as low-bar evidence, not noise.** When a SERP result clearly isn't a real competitor (entertainment business on contractor queries, etc.), don't just filter it — name it as proof the bar is achievable. Surface via "non_competitor_filter" kind with framing like "even [type] outranks you on [query] — clearing this bar is about consistent presence and hygiene, not about beating capable competitors."

4. **Prioritize by IMPACT, not difficulty** — a "high" priority recommendation should be one that, if acted on, would meaningfully close the rank gap. The lifts are achievable — say so.

5. **Subscriber-readable voice with confident tone.** Write like a strategist talking to a business owner. The undercurrent: "you're better than these ranked operators, and we're going to make that visible." Avoid anxious or apologetic language.

6. **ALWAYS include "what to do"** — every recommendation has an actionability field with a concrete next action.

7. **Cite the DATA explicitly in the reasoning** — patterns like "X of N top competitors are tagged as <category>, you're tagged as <other>" earn trust by being verifiable against the snapshot.

8. **Avoid filler** — if only 3 strong recommendations exist, return 3. Don't pad.

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
  if (payload.subscriberMetrics) {
    const m = payload.subscriberMetrics;
    lines.push("Subscriber's own GBP metrics (real data — cite these, never invent):");
    lines.push(`  - Google rating: ${m.rating !== null && m.rating !== undefined ? m.rating.toFixed(1) : "unknown"}`);
    lines.push(`  - Google review count: ${m.reviewCount !== null && m.reviewCount !== undefined ? m.reviewCount : "unknown"}`);
    lines.push(`  - GBP completeness score: ${m.completenessScore !== null && m.completenessScore !== undefined ? `${m.completenessScore}/100` : "unknown"}`);
    if (m.completenessMissing && m.completenessMissing.length > 0) {
      lines.push(`  - GBP fields missing: ${m.completenessMissing.join(", ")}`);
    }
    lines.push(`  - Has website: ${m.hasWebsite ? "yes" : "no"}`);
    lines.push(`  - Has phone: ${m.hasPhone ? "yes" : "no"}`);
    lines.push(`  - Has street address on GBP: ${m.hasAddress ? "yes" : "no (service-area business)"}`);
    lines.push(`  - Social profile URLs declared: ${m.socialProfileCount}`);
    lines.push(`  - GBP categories declared: ${m.categoryCount}`);
    lines.push(`  - Service areas declared: ${m.serviceAreaCount}`);
    lines.push("");
  }
  if (payload.subscriberTier) {
    lines.push(`Subscriber's declared commercial tier: ${payload.subscriberTier.label} (slug: ${payload.subscriberTier.slug})`);
    lines.push(`This is the peer group the subscriber chose. Use it to partition competitors below.`);
    lines.push("");
  } else {
    lines.push(`Subscriber commercial tier: NOT DECLARED — treat all competitors as ambient SERP context, not peers.\n`);
  }
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

  const subscriberSlug = payload.subscriberTier?.slug || null;
  const inTier = subscriberSlug
    ? payload.topCompetitors.filter((c) => c.inferredTier?.tierSlug === subscriberSlug)
    : [];
  const crossTier = subscriberSlug
    ? payload.topCompetitors.filter((c) => c.inferredTier?.tierSlug !== subscriberSlug)
    : payload.topCompetitors;

  lines.push(`\n=== IN-TIER COMPETITIVE SET (${inTier.length} of ${payload.topCompetitors.length}) ===`);
  if (subscriberSlug) {
    lines.push(`These are operators classified into the subscriber's tier (${payload.subscriberTier.label}).`);
    lines.push(`Reasoning, comparisons, and "X of N" counts should reference THIS set primarily.\n`);
  } else {
    lines.push(`Subscriber tier not declared — in-tier set is empty.\n`);
  }
  if (inTier.length === 0) {
    lines.push("  (no in-tier competitors in the top results)\n");
  } else {
    for (let i = 0; i < inTier.length; i++) {
      lines.push(formatCompetitor(i + 1, inTier[i]));
    }
  }

  lines.push(`\n=== CROSS-TIER AMBIENT CONTEXT (${crossTier.length} of ${payload.topCompetitors.length}) ===`);
  lines.push(`These operators appear on the SERP but compete in different commercial tiers.`);
  lines.push(`NOT peers — do not equate the subscriber to them. Reference only as ambient signal.\n`);
  if (crossTier.length === 0) {
    lines.push("  (no cross-tier competitors)\n");
  } else {
    for (let i = 0; i < crossTier.length; i++) {
      const tierLabel = crossTier[i].inferredTier?.tierLabel ?? "unclassified";
      lines.push(`[Cross-tier: ${tierLabel}]`);
      lines.push(formatCompetitor(i + 1, crossTier[i]));
    }
  }

  lines.push(`\nTotal observed across all queries: ${payload.totalCompetitorsObserved} businesses\n`);

  lines.push(`=== ASK ===\n`);
  lines.push(`Return the top ${count} most impactful, actionable recommendations as a JSON array.`);
  lines.push(`Each recommendation must have: { kind, title, message, priority, reasoning, actionability }.`);
  lines.push(`kind options: category_gap, category_alignment, review_velocity, rating_gap, competitor_watch, non_competitor_filter, geographic_gap, category_dominance, service_offering, general.`);
  lines.push(`priority options: high, medium, low.`);
  return lines.join("\n");
}

async function loadSubscriberTier(siteId) {
  const [row] = await sql`
    SELECT ct.slug, ct.label
    FROM sites s LEFT JOIN commercial_tiers ct ON ct.id = s.commercial_tier_id
    WHERE s.id = ${siteId}
  `;
  return row?.slug ? { slug: row.slug, label: row.label } : null;
}

async function fetchSubscriberMetricsIfMissing(payload) {
  if (payload.subscriberMetrics) return payload;

  // Backfill subscriberMetrics from gbp_profile + Places API for older
  // analyses persisted before the subscriberMetrics field existed.
  console.log(`  Payload missing subscriberMetrics — backfilling from gbp_profile + Places API...`);
  const [siteRow] = await sql`SELECT gbp_profile FROM sites WHERE id = ${SITE_ID}`;
  const profile = siteRow?.gbp_profile || {};
  const metadata = profile.metadata || {};
  const completeness = profile.completeness || {};
  const placeId = metadata.placeId || null;

  let rating = null;
  let reviewCount = null;
  if (placeId) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      const r = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
        { headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "rating,userRatingCount" } },
      );
      if (r.ok) {
        const d = await r.json();
        rating = d.rating ?? null;
        reviewCount = d.userRatingCount ?? null;
      }
    }
  }

  payload.subscriberMetrics = {
    placeId,
    rating,
    reviewCount,
    completenessScore: typeof completeness.score === "number" ? completeness.score : null,
    completenessMissing: completeness.missing || [],
    hasPhone: Boolean(profile.phoneNumber),
    hasWebsite: Boolean(profile.websiteUri),
    hasAddress: (profile.address?.addressLines?.length || 0) > 0,
    socialProfileCount: (profile.socialProfiles || []).length,
    categoryCount: payload.subscriberCategories?.length || 0,
    serviceAreaCount: payload.subscriberServiceAreas?.length || 0,
  };
  console.log(`  ✓ subscriberMetrics: rating ${rating}, ${reviewCount} reviews, completeness ${completeness.score || "?"}/100`);
  return payload;
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
  let payload = row.analysis_data;
  console.log(`Generating recommendations against analysis ${row.id}...`);
  console.log(`  Competitors in payload: ${payload.topCompetitors.length}`);

  payload = await fetchSubscriberMetricsIfMissing(payload);

  // Always refresh subscriber tier from current sites state — tier can
  // change between persisted snapshot and regen run.
  payload.subscriberTier = await loadSubscriberTier(SITE_ID);
  const classifiedCount = payload.topCompetitors.filter((c) => c.inferredTier).length;
  console.log(`  Subscriber tier: ${payload.subscriberTier?.label || "(not set)"}`);
  console.log(`  Competitors with tier classification: ${classifiedCount}/${payload.topCompetitors.length}`);

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
