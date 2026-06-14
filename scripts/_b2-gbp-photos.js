/**
 * Ad-hoc: inspect B2's gbp_photo_sync state after the GBP reconnect.
 *
 * Run: node scripts/_b2-gbp-photos.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch {}
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    const [biz] = (await c.query(`
      SELECT id, name FROM businesses
      WHERE name ILIKE '%b2 construction%' OR name ILIKE '%b squared%'
      ORDER BY created_at DESC LIMIT 1
    `)).rows;
    if (!biz) return console.log("No B2 business.");
    console.log(`B2 business_id: ${biz.id}\n`);

    const [counts] = (await c.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE category = 'COVER')::int AS cover_count,
        COUNT(*) FILTER (WHERE category = 'LOGO')::int AS logo_count,
        MAX(synced_at) AS most_recent_sync
      FROM gbp_photo_sync
      WHERE business_id = $1
    `, [biz.id])).rows;
    console.log(`=== gbp_photo_sync totals ===`);
    console.log(`  total rows:      ${counts.total}`);
    console.log(`  COVER rows:      ${counts.cover_count}`);
    console.log(`  LOGO rows:       ${counts.logo_count}`);
    console.log(`  most recent sync: ${counts.most_recent_sync ?? "(never)"}\n`);

    const byCat = (await c.query(`
      SELECT category, COUNT(*)::int AS n, MAX(synced_at) AS latest
      FROM gbp_photo_sync
      WHERE business_id = $1
      GROUP BY category
      ORDER BY n DESC
    `, [biz.id])).rows;
    console.log(`=== rows by category ===`);
    for (const r of byCat) {
      console.log(`  ${r.category.padEnd(20)} ${String(r.n).padStart(3)}  (latest ${r.latest?.toISOString?.() ?? r.latest})`);
    }

    const sample = (await c.query(`
      SELECT category, gbp_media_url, synced_at
      FROM gbp_photo_sync
      WHERE business_id = $1
      ORDER BY synced_at DESC NULLS LAST
      LIMIT 5
    `, [biz.id])).rows;
    console.log(`\n=== 5 most recent rows ===`);
    for (const r of sample) {
      const u = r.gbp_media_url ? r.gbp_media_url.slice(0, 80) + "..." : "(null)";
      console.log(`  ${r.category.padEnd(18)} ${r.synced_at?.toISOString?.() ?? r.synced_at}`);
      console.log(`    ${u}`);
    }
  } finally {
    c.release();
    await pool.end();
  }
})();
