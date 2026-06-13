/**
 * Migration 162: Rename two GBP-scoped task titles for clarity.
 *
 *   brand_categorization: "Brand categorization (GBP taxonomy)" → "GBP Categories"
 *   gbp_location:         "Service Areas (Google locations)"    → "GBP Service Areas"
 *
 * Title-only rename. Task keys, deps, and sub_tasks unchanged.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-162-rename-gbp-task-titles.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    const cats = await c.query(`
      UPDATE provisioning_tasks
      SET title = 'GBP Categories'
      WHERE task_key = 'brand_categorization' AND title <> 'GBP Categories'
      RETURNING billing_account_id
    `);
    console.log(`✓ Renamed brand_categorization → 'GBP Categories' on ${cats.rowCount} accounts`);

    const sas = await c.query(`
      UPDATE provisioning_tasks
      SET title = 'GBP Service Areas'
      WHERE task_key = 'gbp_location' AND title <> 'GBP Service Areas'
      RETURNING billing_account_id
    `);
    console.log(`✓ Renamed gbp_location → 'GBP Service Areas' on ${sas.rowCount} accounts`);

    await c.query("COMMIT");
    console.log("\n✅ Title rename complete\n");

    const [first] = cats.rows.length ? cats.rows : sas.rows;
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
