/**
 * Migration 164: Drop the sole sub_task from gbp_location ("GBP Service Areas").
 *
 * After the 2026-06-13 reshape, gbp_location was scoped to a single
 * sub-concern (service_areas). Modelling a single concern as a sub_task
 * is overkill — the card status itself represents whether service areas
 * have been declared. Mirrors the simplification applied to integrations
 * in migration 160.
 *
 * Recompute reads the service_area place_infos count directly to set
 * parent task status; no sub_task indirection.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-164-drop-gbp-location-sub-tasks.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    const subDrop = await c.query(`
      DELETE FROM provisioning_sub_tasks
      WHERE task_id IN (
        SELECT id FROM provisioning_tasks WHERE task_key = 'gbp_location'
      )
      RETURNING sub_key
    `);
    const byKey = {};
    for (const r of subDrop.rows) byKey[r.sub_key] = (byKey[r.sub_key] || 0) + 1;
    console.log("✓ Dropped sub_task rows from gbp_location:");
    for (const k of Object.keys(byKey)) {
      console.log(`  ${k.padEnd(16)} ×${byKey[k]}`);
    }

    await c.query("COMMIT");
    console.log("\n✅ gbp_location sub_tasks dropped\n");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("\n❌ Migration failed, rolled back:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
