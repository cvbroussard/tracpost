/**
 * Diagnose GBP API errors by calling the same endpoints the cron uses.
 * Run: node scripts/diagnose-gbp-errors.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const KEY = Buffer.from(process.env.ENCRYPTION_KEY || "", "hex");

function decrypt(encrypted) {
  const parts = encrypted.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const data = Buffer.from(parts[2], "hex");
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data, null, "utf8") + decipher.final("utf8");
}

async function run() {
  const sql = neon(process.env.DATABASE_URL);

  const accounts = await sql`
    SELECT sa.id, sa.account_id, sa.account_name, sa.access_token_encrypted,
           sa.metadata, ssl.site_id, s.name AS site_name
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    JOIN sites s ON s.id = ssl.site_id
    WHERE sa.platform = 'gbp' AND sa.status = 'active'
  `;

  for (const acct of accounts) {
    const token = decrypt(acct.access_token_encrypted);
    const meta = acct.metadata;
    const gbpAccountId = meta.account_id || "";
    const locationPath = gbpAccountId ? `${gbpAccountId}/${acct.account_id}` : acct.account_id;

    console.log(`\n=== ${acct.account_name} (${acct.site_name}) ===`);
    console.log(`  Location path: ${locationPath}`);

    // Test 1: Publish endpoint (GET to check, not POST)
    const postUrl = `https://mybusiness.googleapis.com/v4/${locationPath}/localPosts?pageSize=1`;
    const postRes = await fetch(postUrl, { headers: { Authorization: `Bearer ${token}` } });
    console.log(`  GET localPosts: ${postRes.status}`);
    if (!postRes.ok) {
      const err = await postRes.text();
      console.log(`    Error: ${err.slice(0, 200)}`);
    }

    // Test 2: Reviews
    const reviewUrl = `https://mybusiness.googleapis.com/v4/${locationPath}/reviews?pageSize=1`;
    const reviewRes = await fetch(reviewUrl, { headers: { Authorization: `Bearer ${token}` } });
    console.log(`  GET reviews: ${reviewRes.status}`);
    if (!reviewRes.ok) {
      const err = await reviewRes.text();
      console.log(`    Error: ${err.slice(0, 200)}`);
    }

    // Test 3: Media
    const mediaUrl = `https://mybusiness.googleapis.com/v4/${locationPath}/media?pageSize=1`;
    const mediaRes = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${token}` } });
    console.log(`  GET media: ${mediaRes.status}`);
    if (!mediaRes.ok) {
      const err = await mediaRes.text();
      console.log(`    Error: ${err.slice(0, 200)}`);
    }

    // Test 4: Profile (v1 — uses just locations/{id})
    const profileUrl = `https://mybusinessbusinessinformation.googleapis.com/v1/${acct.account_id}?readMask=title`;
    const profileRes = await fetch(profileUrl, { headers: { Authorization: `Bearer ${token}` } });
    console.log(`  GET profile (v1): ${profileRes.status}`);
    if (!profileRes.ok) {
      const err = await profileRes.text();
      console.log(`    Error: ${err.slice(0, 200)}`);
    } else {
      const data = await profileRes.json();
      console.log(`    Title: ${data.title}`);
    }

    // Test 5: Performance (v1)
    const perfUrl = `https://businessprofileperformance.googleapis.com/v1/${acct.account_id}:getDailyMetricsTimeSeries?dailyMetric=WEBSITE_CLICKS&dailyRange.startDate.year=2026&dailyRange.startDate.month=4&dailyRange.startDate.day=19&dailyRange.endDate.year=2026&dailyRange.endDate.month=4&dailyRange.endDate.day=20`;
    const perfRes = await fetch(perfUrl, { headers: { Authorization: `Bearer ${token}` } });
    console.log(`  GET performance (v1): ${perfRes.status}`);
    if (!perfRes.ok) {
      const err = await perfRes.text();
      console.log(`    Error: ${err.slice(0, 200)}`);
    }
  }
}

run().catch(console.error);
