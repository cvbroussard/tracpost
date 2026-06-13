/**
 * Migration 158: Rename gbp_location task title to make scope explicit.
 *
 * Per the 2026-06-13 platform-vs-owner-authored separation:
 *   - Categories (GBP taxonomy) — PLATFORM-authored — lives on step 3
 *     (brand_categorization)
 *   - Service Areas (Google locations) — OWNER-authored — lives on
 *     step 14 (gbp_location)
 *
 * The previous title "GBP brand identity" was ambiguous between these
 * two. Rename to make the scope unmistakable.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-158-rename-gbp-location-to-service-areas.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    const renamed = await c.query(`
      UPDATE provisioning_tasks
      SET title = 'Service Areas (Google locations)'
      WHERE task_key = 'gbp_location'
        AND title <> 'Service Areas (Google locations)'
      RETURNING billing_account_id
    `);
    console.log(`✓ Renamed gbp_location → 'Service Areas (Google locations)' on ${renamed.rowCount} accounts`);

    await c.query("COMMIT");
    console.log("\n✅ gbp_location rename complete\n");

    const [first] = renamed.rows;
    if (first) {
      const verify = await c.query(`
        SELECT task_key, title FROM provisioning_tasks
        WHERE billing_account_id = $1 AND task_key IN ('brand_categorization', 'gbp_location')
        ORDER BY sort_order
      `, [first.billing_account_id]);
      for (const r of verify.rows) {
        console.log(`  ${r.task_key.padEnd(28)} '${r.title}'`);
      }
    }
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("\n❌ Migration failed, rolled back:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
