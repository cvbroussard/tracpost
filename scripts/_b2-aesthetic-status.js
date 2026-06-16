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
      SELECT status, extraction_model, extracted_at, extraction_confidence,
             updated_at, extracted_inputs
      FROM brand_descriptor
      WHERE brand_identity_id IN (SELECT id FROM brand_identity WHERE business_id = $1)
        AND key = 'aesthetic'
      LIMIT 1
    `, [biz.id])).rows;
    console.log("brand_descriptor[aesthetic]:");
    console.log(`  status:                ${d.status}`);
    console.log(`  extraction_model:      ${d.extraction_model}`);
    console.log(`  extracted_at:          ${d.extracted_at && d.extracted_at.toISOString()}`);
    console.log(`  extraction_confidence: ${d.extraction_confidence}`);
    console.log(`  updated_at:            ${d.updated_at.toISOString()}`);
    console.log(`\nextracted_inputs (error if failed):`);
    console.log(JSON.stringify(d.extracted_inputs, null, 2));
  } finally { c.release(); await pool.end(); }
})();
