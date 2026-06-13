/**
 * Migration 163: Rename brand_categorization task title.
 *   "GBP Categories" → "GBP Business Categories"
 *
 * Title-only rename. Task key, deps, sub_tasks unchanged.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-163-rename-gbp-categories-to-business-categories.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    const r = await c.query(`
      UPDATE provisioning_tasks
      SET title = 'GBP Business Categories'
      WHERE task_key = 'brand_categorization' AND title <> 'GBP Business Categories'
      RETURNING billing_account_id
    `);
    console.log(`✓ Renamed brand_categorization → 'GBP Business Categories' on ${r.rowCount} accounts`);

    await c.query("COMMIT");
    console.log("\n✅ Rename complete\n");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("\n❌ Migration failed, rolled back:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
