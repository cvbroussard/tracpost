const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch {}
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    const [biz] = (await c.query(`
      SELECT id FROM businesses WHERE name ILIKE '%b2 construction%' LIMIT 1
    `)).rows;
    if (!biz) return console.log("No B2.");
    const [bi] = (await c.query(`SELECT id FROM brand_identity WHERE business_id = $1 LIMIT 1`, [biz.id])).rows;
    if (!bi) return console.log("No brand_identity row.");
    console.log(`B2 brand_identity_id: ${bi.id}\n`);

    const rows = (await c.query(`
      SELECT domain, key,
             declared IS NOT NULL AND declared <> 'null'::jsonb AS has_declared,
             declared
      FROM brand_descriptor
      WHERE brand_identity_id = $1
      ORDER BY domain, key
    `, [bi.id])).rows;

    for (const r of rows) {
      console.log(`${r.domain}.${r.key.padEnd(22)} declared=${r.has_declared ? "yes" : "no"}`);
      if (r.has_declared) {
        const s = JSON.stringify(r.declared);
        console.log(`  ${s.slice(0, 200)}${s.length > 200 ? "…" : ""}`);
      }
    }
  } finally { c.release(); await pool.end(); }
})();
