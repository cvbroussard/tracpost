/**
 * One-time: reclassify engagement_events that were classified by rules
 * (rationale IS NULL) using the LLM. Skips GBP reviews (their sentiment is
 * derived from star rating, not body — explicit override).
 *
 * Run with: node scripts/reclassify-engagement-sentiment.js
 */
const { neon } = require("@neondatabase/serverless");
const Anthropic = require("@anthropic-ai/sdk").default;
require("dotenv").config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);
const anthropic = new Anthropic();

async function classify(body) {
  const r = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{
      role: "user",
      content: `Classify the sentiment of this customer comment toward the business it's directed at. Account for sarcasm, negation, mixed sentiment, and tone. Promotional/spam outreach with friendly language is positive (not negative) — judge tonally.

Comment: "${body.replace(/"/g, '\\"').slice(0, 1000)}"

Return ONLY JSON, no markdown:
{"sentiment":"positive|neutral|negative","score":<-1 to 1>,"rationale":"<one short sentence>"}`,
    }],
  });
  const raw = r.content[0].text;
  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned);
}

(async () => {
  // Skip GBP reviews (star-rating-derived sentiment is explicit, not body-classified)
  const rows = await sql`
    SELECT id, body, sentiment AS old_sentiment, platform, event_type
    FROM engagement_events
    WHERE body IS NOT NULL
      AND length(body) >= 2
      AND metadata->>'sentiment_rationale' IS NULL
      AND NOT (platform = 'gbp' AND event_type = 'review')
    ORDER BY discovered_at DESC
  `;
  console.log(`Reclassifying ${rows.length} event(s)...`);
  let changed = 0;
  for (const r of rows) {
    try {
      const result = await classify(r.body);
      const score = typeof result.score === "number" ? Math.max(-1, Math.min(1, result.score)) : 0;
      await sql`
        UPDATE engagement_events
        SET sentiment = ${result.sentiment},
            sentiment_score = ${score},
            metadata = metadata || ${JSON.stringify({ sentiment_rationale: result.rationale })}::jsonb
        WHERE id = ${r.id}
      `;
      const flipped = r.old_sentiment !== result.sentiment;
      if (flipped) changed++;
      console.log(`  ${r.platform}/${r.event_type}: ${r.old_sentiment} → ${result.sentiment}${flipped ? " (FLIPPED)" : ""} :: ${(result.rationale || "").slice(0, 80)}`);
    } catch (err) {
      console.error(`  ${r.id}: failed —`, err.message);
    }
  }
  console.log(`\nReclassified ${rows.length}, flipped ${changed}.`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
