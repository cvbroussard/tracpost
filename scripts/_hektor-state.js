const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch {}
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    const bizRows = (await c.query(`
      SELECT id, name, url,
             gbp_profile IS NOT NULL AND gbp_profile <> '{}'::jsonb AS has_gbp
      FROM businesses
      WHERE name ILIKE '%hektor%' OR name ILIKE '%hector%'
      ORDER BY created_at DESC LIMIT 3
    `)).rows;
    if (!bizRows.length) return console.log("No Hektor business.");
    const biz = bizRows[0];
    console.log("=== Business ===");
    console.log(JSON.stringify(biz, null, 2));

    const decl = (await c.query(`
      SELECT bd.domain, bd.key,
             bd.declared IS NOT NULL AND bd.declared <> 'null'::jsonb AND bd.declared <> '{}'::jsonb AS has_declared
      FROM brand_descriptor bd
      JOIN brand_identity bi ON bi.id = bd.brand_identity_id
      WHERE bi.business_id = $1
      ORDER BY bd.domain, bd.key
    `, [biz.id])).rows;
    const declared = decl.filter(d => d.has_declared);
    console.log(`\n=== brand_descriptor rows: ${decl.length} (${declared.length} declared) ===`);
    for (const d of declared) console.log(`  ${d.domain}.${d.key}`);

    const obs = (await c.query(`
      SELECT id, updated_at,
             payload->'meta' AS meta,
             jsonb_array_length(COALESCE(payload->'gaps_and_absences', '[]'::jsonb)) AS gap_count,
             jsonb_array_length(COALESCE(payload->'distinctive_elements_vs_category_defaults', '[]'::jsonb)) AS distinctive_count
      FROM business_substrate
      WHERE business_id = $1 AND kind = 'public_presence_observation'
      ORDER BY updated_at DESC LIMIT 1
    `, [biz.id])).rows;
    console.log(`\n=== PPA observations: ${obs.length} ===`);
    if (obs[0]) console.log(JSON.stringify(obs[0], null, 2));

    const fnd = (await c.query(`
      SELECT id, updated_at,
             jsonb_array_length(COALESCE(payload->'findings', '[]'::jsonb)) AS finding_count
      FROM business_substrate
      WHERE business_id = $1 AND kind = 'readiness_findings'
      ORDER BY updated_at DESC LIMIT 1
    `, [biz.id])).rows;
    console.log(`\n=== Readiness findings substrate: ${fnd.length} ===`);
    if (fnd[0]) console.log(JSON.stringify(fnd[0], null, 2));
  } finally { c.release(); await pool.end(); }
})();
