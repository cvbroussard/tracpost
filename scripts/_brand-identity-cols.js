const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch {}
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    const r = await c.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'brand_identity'
      ORDER BY ordinal_position
    `);
    console.log("brand_identity columns:");
    for (const row of r.rows) console.log(`  ${row.column_name.padEnd(28)} ${row.data_type}`);
  } finally { c.release(); await pool.end(); }
})();
