const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch {}
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    const [biz] = (await c.query(`
      SELECT id, name, tagline FROM businesses WHERE name ILIKE '%b2 construction%' LIMIT 1
    `)).rows;
    console.log(`B2: ${biz.id}`);
    console.log(`businesses.tagline column: ${JSON.stringify(biz.tagline)}`);

    const desc = (await c.query(`
      SELECT descriptor_key, declared, declared_status, updated_at
      FROM brand_descriptor
      WHERE brand_id IN (SELECT id FROM brands WHERE business_id = $1)
        AND descriptor_key = 'tagline'
      LIMIT 1
    `, [biz.id])).rows[0];
    console.log(`\nbrand_descriptor[tagline]:`);
    console.log(`  declared: ${JSON.stringify(desc?.declared)}`);
    console.log(`  status:   ${desc?.declared_status}`);

    const [pub] = (await c.query(`
      SELECT
        content->'sections'->0->>'headline' AS headline,
        content->'sections'->0->>'subhead'  AS subhead,
        content->'sections'->0->>'tagline'  AS tagline
      FROM website_content
      WHERE business_id = $1 AND page_key = 'home' AND status = 'published'
      LIMIT 1
    `, [biz.id])).rows;
    console.log(`\npublished hero section:`);
    console.log(`  headline: ${pub?.headline}`);
    console.log(`  subhead:  ${pub?.subhead}`);
    console.log(`  tagline:  ${pub?.tagline}`);
  } finally { c.release(); await pool.end(); }
})();
