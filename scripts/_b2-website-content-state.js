const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch {}
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    const [biz] = (await c.query(`
      SELECT id, name, url FROM businesses WHERE name ILIKE '%b2 construction%' LIMIT 1
    `)).rows;
    if (!biz) return console.log("No B2.");
    console.log(`B2 id: ${biz.id}\nB2 url: ${biz.url}\n`);

    const rows = (await c.query(`
      SELECT id, page_key, status, generated_at, updated_at
      FROM website_content
      WHERE business_id = $1 AND page_key = 'home'
      ORDER BY updated_at DESC
      LIMIT 10
    `, [biz.id])).rows;
    console.log(`website_content rows for B2 home (${rows.length}):`);
    for (const r of rows) {
      console.log(`  ${r.id.slice(0,8)}…  ${r.status.padEnd(10)} gen=${r.generated_at.toISOString()}  upd=${r.updated_at.toISOString()}`);
    }

    const [pub] = (await c.query(`
      SELECT
        content->'sections'->0->>'headline' AS hero_headline,
        content->'sections'->0->'hero_image'->>'url' AS hero_image_url,
        content->'sections'->0->>'tagline' AS hero_tagline
      FROM website_content
      WHERE business_id = $1 AND page_key = 'home' AND status = 'published'
      LIMIT 1
    `, [biz.id])).rows;
    if (pub) {
      console.log("\nPUBLISHED row content:");
      console.log(`  headline: ${pub.hero_headline}`);
      console.log(`  tagline:  ${pub.hero_tagline}`);
      console.log(`  image:    ${pub.hero_image_url}`);
    } else {
      console.log("\nNo published row exists — promote may not have fired.");
    }
  } finally { c.release(); await pool.end(); }
})();
