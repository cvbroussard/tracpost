#!/usr/bin/env node
/**
 * Operator script: run GBP categories coaching against a site.
 *
 * Requires a completed CMA for the site (β rule). Prints the 10-best
 * ranked plan with reasoning. Does NOT persist or push to GBP — that's
 * a separate ceremony.
 *
 * Usage:
 *   node scripts/run-category-coaching.js <site_id>
 *
 * Cost: ~$0.01 (Haiku 4.5, ~3-4k token prompt).
 *
 * Inline duplicate of src/lib/competitive-intel/category-coaching.ts —
 * follows the existing pattern (generate-cma-recommendations.js,
 * enrich-cma-tier2.js) since the project doesn't ship a TS runner.
 */
const { neon } = require("@neondatabase/serverless");
const Anthropic = require("@anthropic-ai/sdk").default;
require("dotenv").config({ path: ".env.local" });

const SITE_ID = process.argv[2];
if (!SITE_ID) {
  console.error("Usage: node scripts/run-category-coaching.js <site_id>");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const sql = neon(process.env.DATABASE_URL);

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

- **In-tier frequency** — categories used by SERP competitors classified into the subscriber's declared commercial tier. THIS is the primary signal for what categories to keep, add, or promote — these competitors share the subscriber's structural position and clientele.

- **Cross-tier ambient** — categories used by SERP competitors in different tiers (specialty trades, scale operators, out-of-category). DO NOT use cross-tier category usage as a reason to add categories the subscriber isn't already declaring. Cross-tier signal is informational only.

Rules for tier-aware category coaching:
- "3 of N competitors use this category" should reference IN-TIER counts unless explicitly noted otherwise.
- Don't add categories on the basis of cross-tier usage alone (e.g., don't add "Tile contractor" because a specialty-trade tile shop uses it).
- Out-of-category competitor categories (e.g., an art studio's "Painting lessons") MUST be excluded from any category recommendations.

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

function buildCompetitorFrequencyDigest(competitorCategories) {
  const map = new Map();
  for (const cc of competitorCategories) {
    for (let i = 0; i < cc.gcids.length; i++) {
      const gcid = cc.gcids[i];
      const name = cc.displayNames[i];
      const isPrimary = gcid === cc.primaryGcid;
      const entry = map.get(gcid) || { count: 0, competitors: [], primaryCount: 0, displayName: name };
      entry.count++;
      if (!entry.competitors.includes(cc.title)) entry.competitors.push(cc.title);
      if (isPrimary) entry.primaryCount++;
      map.set(gcid, entry);
    }
  }
  return Array.from(map.entries())
    .map(([gcid, v]) => ({ gcid, ...v }))
    .sort((a, b) => b.count - a.count);
}

function partitionByTier(competitorCategories, topCompetitors, subscriberTierSlug) {
  const tierByCid = new Map();
  for (const c of topCompetitors) tierByCid.set(c.placeId, c.inferredTier?.tierSlug || null);
  if (!subscriberTierSlug) return { inTier: [], crossTier: competitorCategories };
  const inTier = [], crossTier = [];
  for (const cc of competitorCategories) {
    if (tierByCid.get(cc.cid) === subscriberTierSlug) inTier.push(cc);
    else crossTier.push(cc);
  }
  return { inTier, crossTier };
}

function distillBrandDna(brandDna) {
  if (!brandDna) return "(no Brand DNA available)";
  const signals = brandDna.signals || {};
  const angle = brandDna.subscriber_angle || null;
  const voice = signals.voice || {};
  const lines = [];
  if (angle) lines.push(`Positioning angle: ${angle}`);
  if (voice.distinctive_traits) {
    const traits = voice.distinctive_traits.slice(0, 3);
    lines.push(`Voice traits: ${traits.join("; ")}`);
  }
  if (voice.tone) lines.push(`Tone: ${voice.tone}`);
  return lines.length > 0 ? lines.join("\n") : "(Brand DNA present but no usable signals)";
}

function buildPrompt(a) {
  const lines = [];
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

  lines.push(`=== IN-TIER COMPETITOR CATEGORY FREQUENCY (across ${a.inTierCount} ${a.subscriberTierLabel || ""} competitors) ===`);
  lines.push("PRIMARY SIGNAL. Sorted by appearance count. These competitors share the subscriber's tier.\n");
  if (a.inTierFreq.length === 0) {
    lines.push("  (no in-tier competitors had category data — rely on subscriber declarations + Brand DNA)\n");
  } else {
    for (const e of a.inTierFreq) {
      lines.push(`  ${e.count}/${a.inTierCount}  [primary on ${e.primaryCount}]  ${e.gcid}  →  ${e.displayName}`);
      lines.push(`     used by: ${e.competitors.join(", ")}`);
    }
  }
  lines.push("");

  lines.push(`=== CROSS-TIER AMBIENT CATEGORY FREQUENCY (across ${a.crossTierCount} cross-tier competitors) ===`);
  lines.push("AMBIENT ONLY — do not weight these as reasons to add/drop categories.\n");
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

async function run() {
  const [site] = await sql`
    SELECT
      s.id, s.name,
      s.gbp_profile->>'description' AS gbp_description,
      s.brand_dna,
      ct.slug AS tier_slug, ct.label AS tier_label,
      (SELECT JSON_AGG(JSON_BUILD_OBJECT('gcid', gc.gcid, 'name', gc.name, 'isPrimary', sgc.is_primary))
       FROM site_gbp_categories sgc JOIN gbp_categories gc ON gc.gcid = sgc.gcid
       WHERE sgc.site_id = ${SITE_ID}) AS current_categories
    FROM sites s LEFT JOIN commercial_tiers ct ON ct.id = s.commercial_tier_id
    WHERE s.id = ${SITE_ID}
  `;
  if (!site) { console.error("Site not found"); process.exit(1); }

  const [cma] = await sql`
    SELECT id, analysis_data
    FROM competitive_market_analyses
    WHERE site_id = ${SITE_ID} AND status = 'complete'
    ORDER BY generated_at DESC LIMIT 1
  `;
  if (!cma) {
    console.error("No completed CMA for this site. Run scripts/run-competitive-analysis.js first (β rule).");
    process.exit(1);
  }
  const payload = cma.analysis_data;
  console.log(`Loaded site "${site.name}" + CMA ${cma.id}`);
  console.log(`  tier: ${site.tier_label || "(not set)"}`);
  console.log(`  current categories: ${(site.current_categories || []).length}`);
  console.log(`  competitorCategories in CMA: ${(payload.competitorCategories || []).length}`);
  if ((payload.competitorCategories || []).length === 0) {
    console.error("CMA exists but has no Tier 2 competitorCategories. Run scripts/enrich-cma-tier2.js first.");
    process.exit(1);
  }
  const classifiedCount = (payload.topCompetitors || []).filter((c) => c.inferredTier).length;
  console.log(`  competitors with tier classification: ${classifiedCount}/${(payload.topCompetitors || []).length}`);

  const currentCategories = site.current_categories || [];
  const { inTier, crossTier } = partitionByTier(
    payload.competitorCategories,
    payload.topCompetitors || [],
    site.tier_slug || null,
  );
  const inTierFreq = buildCompetitorFrequencyDigest(inTier);
  const crossTierFreq = buildCompetitorFrequencyDigest(crossTier);
  console.log(`  partition: ${inTier.length} in-tier / ${crossTier.length} cross-tier\n`);

  const universeGcids = new Set();
  for (const c of currentCategories) universeGcids.add(c.gcid);
  for (const cc of payload.competitorCategories) for (const g of cc.gcids) universeGcids.add(g);
  const catalogSlice = await sql`
    SELECT gcid, name FROM gbp_categories
    WHERE gcid = ANY(${Array.from(universeGcids)}::text[])
    ORDER BY name
  `;

  const userMessage = buildPrompt({
    siteName: site.name,
    subscriberTierLabel: site.tier_label || null,
    currentCategories,
    gbpDescription: site.gbp_description,
    brandDnaDigest: distillBrandDna(site.brand_dna),
    inTierFreq,
    crossTierFreq,
    inTierCount: inTier.length,
    crossTierCount: crossTier.length,
    catalogSlice,
  });

  console.log(`\nFiring Haiku coaching call (~3-4k tokens, ~$0.01)...\n`);
  const res = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) { console.error("LLM returned no JSON array. Raw:", text.slice(0, 500)); process.exit(1); }
  const categories = JSON.parse(match[0]);

  console.log(`=== 10-BEST CATEGORY PLAN ===\n`);
  categories.forEach((c, i) => {
    const actionIcon = { keep: "  ", add: "✚ ", drop: "✗ ", promote_to_primary: "↑ " }[c.action] || "  ";
    const primaryMarker = c.proposedPrimary ? " ★ PRIMARY" : "";
    const conf = Math.round(c.confidence * 10);
    const bar = "▓".repeat(conf) + "░".repeat(10 - conf);
    console.log(`${i + 1}. ${actionIcon}${c.name}  [${c.gcid}]${primaryMarker}`);
    console.log(`     action: ${c.action}   confidence: ${bar} ${(c.confidence * 100).toFixed(0)}%`);
    console.log(`     why: ${c.reasoning}\n`);
  });

  const currentPrimary = currentCategories.find((c) => c.isPrimary)?.gcid || null;
  const proposedPrimary = categories.find((c) => c.proposedPrimary)?.gcid || null;
  console.log(`=== SUMMARY ===`);
  console.log(`Keep: ${categories.filter((c) => c.action === "keep").length} | Add: ${categories.filter((c) => c.action === "add").length} | Drop: ${categories.filter((c) => c.action === "drop").length}`);
  console.log(`Primary: ${currentPrimary || "(none)"} → ${proposedPrimary || "(none)"}${currentPrimary !== proposedPrimary ? "  *** CHANGED ***" : ""}`);
}

run().catch((err) => { console.error(err); process.exit(1); });
