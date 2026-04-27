/**
 * Run the Signal Sufficiency Score against every active site.
 * Prints a portfolio breakdown.
 *
 * NOTE: this is a CLI-side reimplementation of the TS scorer in
 * src/lib/brand-dna/score.ts so we can run before building the Next route.
 * Keep them in sync if you change weights/targets.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const WEIGHTS = { qualityCaptions: 0.40, positiveReviews: 0.25, gbpProfile: 0.20, voiceConsistency: 0.15 };
const CAPTION_TARGET = 30;
const REVIEW_TARGET = 15;
const VOICE_MIN_SAMPLES = 5;

function tier(score) {
  if (score >= 0.7) return "rich";
  if (score >= 0.3) return "moderate";
  return "minimal";
}

async function score(sql, siteId) {
  const captions = await sql`
    SELECT caption, COALESCE(like_count, 0) + COALESCE(comment_count, 0) AS engagement
    FROM historical_posts
    WHERE site_id = ${siteId}
      AND caption IS NOT NULL
      AND length(caption) >= 15
      AND COALESCE(like_count, 0) + COALESCE(comment_count, 0) >= 3
      AND (posted_at IS NULL OR posted_at >= NOW() - INTERVAL '18 months')
      AND hidden_at IS NULL
  `;
  const captionCount = captions.length;
  const captionScore = Math.min(captionCount / CAPTION_TARGET, 1);

  const reviewRow = await sql`
    SELECT COUNT(*)::int AS n
    FROM engagement_events
    WHERE site_id = ${siteId}
      AND platform = 'gbp'
      AND event_type = 'review'
      AND body IS NOT NULL
      AND length(body) >= 30
      AND (metadata->>'star_rating' IN ('FOUR', 'FIVE') OR sentiment = 'positive')
  `;
  const reviewCount = reviewRow[0]?.n || 0;
  const reviewScore = Math.min(reviewCount / REVIEW_TARGET, 1);

  const [siteRow] = await sql`SELECT gbp_profile, business_phone, name FROM sites WHERE id = ${siteId}`;
  const gbp = siteRow?.gbp_profile || {};
  const fields = [];
  let gbpRaw = 0;
  if (gbp.description && gbp.description.length >= 80) { gbpRaw += 0.4; fields.push("description"); }
  const additionalCats = gbp.additional_categories || [];
  if (gbp.primary_category && additionalCats.length >= 1) { gbpRaw += 0.2; fields.push("categories"); }
  else if (gbp.primary_category) { gbpRaw += 0.1; fields.push("primary_category"); }
  if (gbp.regular_hours) { gbpRaw += 0.2; fields.push("hours"); }
  if (gbp.primary_phone || siteRow?.business_phone) { gbpRaw += 0.1; fields.push("phone"); }
  if (gbp.website_uri) { gbpRaw += 0.1; fields.push("website"); }
  const gbpScore = Math.min(gbpRaw, 1);

  let voiceScore = 0, cv = null, analyzed = 0;
  if (captionCount >= VOICE_MIN_SAMPLES) {
    const lengths = captions.map(c => c.caption.length);
    analyzed = lengths.length;
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((acc, l) => acc + (l - mean) ** 2, 0) / lengths.length;
    const stddev = Math.sqrt(variance);
    cv = mean > 0 ? stddev / mean : 0;
    voiceScore = Math.max(0, Math.min(1, 1 - cv));
  }

  const composite = Math.min(1,
    captionScore * WEIGHTS.qualityCaptions +
    reviewScore * WEIGHTS.positiveReviews +
    gbpScore * WEIGHTS.gbpProfile +
    voiceScore * WEIGHTS.voiceConsistency
  );

  return {
    name: siteRow?.name || siteId,
    score: Math.round(composite * 100) / 100,
    tier: tier(composite),
    captions: { count: captionCount, score: Math.round(captionScore * 100) / 100 },
    reviews: { count: reviewCount, score: Math.round(reviewScore * 100) / 100 },
    gbp: { score: Math.round(gbpScore * 100) / 100, fields },
    voice: { score: Math.round(voiceScore * 100) / 100, cv: cv === null ? null : Math.round(cv * 100) / 100, analyzed },
  };
}

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  const sites = await sql`SELECT id, name FROM sites WHERE is_active = true AND deleted_at IS NULL ORDER BY name`;
  console.log(`\nScoring ${sites.length} active sites...\n`);

  const results = [];
  for (const s of sites) {
    const r = await score(sql, s.id);
    results.push(r);
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Portfolio summary
  const counts = { rich: 0, moderate: 0, minimal: 0 };
  for (const r of results) counts[r.tier]++;

  console.log("─".repeat(78));
  console.log("Portfolio:", `${counts.rich} rich · ${counts.moderate} moderate · ${counts.minimal} minimal`);
  console.log("─".repeat(78));

  for (const r of results) {
    const tierLabel = r.tier.toUpperCase().padEnd(9);
    console.log(`\n[${tierLabel}] ${r.name.padEnd(40)} score=${r.score}`);
    console.log(`   captions: ${r.captions.count.toString().padStart(3)} (s=${r.captions.score})  ` +
                `reviews: ${r.reviews.count.toString().padStart(3)} (s=${r.reviews.score})  ` +
                `gbp: ${r.gbp.score} [${r.gbp.fields.join(",") || "none"}]  ` +
                `voice: ${r.voice.score}${r.voice.cv !== null ? ` (cv=${r.voice.cv}, n=${r.voice.analyzed})` : ""}`);
  }
  console.log();
})().catch(err => { console.error(err); process.exit(1); });
