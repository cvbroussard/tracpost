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
    console.log(`B2 id: ${biz.id}\n`);

    const ppa = (await c.query(`
      SELECT id, run_number, created_at, updated_at
      FROM business_substrate
      WHERE business_id = $1 AND kind = 'public_presence_observation'
      ORDER BY run_number DESC
    `, [biz.id])).rows;
    console.log(`PPA runs (${ppa.length}):`);
    for (const r of ppa) {
      console.log(`  run #${r.run_number}  id=${r.id.slice(0,8)}…  created=${r.created_at.toISOString()}  updated=${r.updated_at.toISOString()}`);
    }

    const findings = (await c.query(`
      SELECT id, run_number, created_at, updated_at, generation_metadata->>'source_substrate_id' AS source_id
      FROM business_substrate
      WHERE business_id = $1 AND kind = 'readiness_findings'
      ORDER BY run_number DESC
    `, [biz.id])).rows;
    console.log(`\nReadiness findings runs (${findings.length}):`);
    for (const r of findings) {
      console.log(`  run #${r.run_number}  id=${r.id.slice(0,8)}…  source=${(r.source_id||'').slice(0,8)}…  upd=${r.updated_at.toISOString()}`);
    }
  } finally { c.release(); await pool.end(); }
})();
