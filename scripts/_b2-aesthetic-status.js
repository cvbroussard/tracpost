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

    const [d] = (await c.query(`
      SELECT key, extracted_status, last_extraction_attempt, last_extraction_error,
             updated_at
      FROM brand_descriptor
      WHERE brand_identity_id IN (SELECT id FROM brand_identity WHERE business_id = $1)
        AND key = 'aesthetic'
      LIMIT 1
    `, [biz.id])).rows;
    console.log("brand_descriptor[aesthetic]:");
    console.log(JSON.stringify(d, null, 2));
  } finally { c.release(); await pool.end(); }
})();
