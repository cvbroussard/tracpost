/**
 * Migration 160: Drop ALL sub_tasks from the integrations task.
 *
 * Per the 2026-06-13 simplification: the integrations step has been
 * scoped down to "GBP integration" (single concern). With only one
 * sub-concern, modelling it as a sub_task is overkill — the card
 * itself represents the GBP integration status, and clicking renders
 * the drawer body directly. Drop sub_tasks entirely.
 *
 * The recompute layer reads the GBP connection state from
 * business_platform_assets (same signal it used for the sub_task) and
 * sets the parent task status directly — no sub_task indirection.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-160-drop-integrations-sub-tasks.js
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
        SELECT id FROM provisioning_tasks WHERE task_key = 'integrations'
      )
      RETURNING sub_key
    `);
    const byKey = {};
    for (const r of subDrop.rows) {
      byKey[r.sub_key] = (byKey[r.sub_key] || 0) + 1;
    }
    console.log("✓ Dropped sub_task rows from integrations:");
    for (const k of Object.keys(byKey)) {
      console.log(`  ${k.padEnd(12)} ×${byKey[k]}`);
    }

    await c.query("COMMIT");
    console.log("\n✅ integrations sub_tasks dropped\n");

    const verify = await c.query(`
      SELECT t.task_key, t.title,
             COALESCE((SELECT json_agg(s.sub_key ORDER BY s.sort_order)
                       FROM provisioning_sub_tasks s WHERE s.task_id = t.id), '[]'::json) AS sub_keys
      FROM provisioning_tasks t
      WHERE t.task_key = 'integrations'
      LIMIT 1
    `);
    for (const r of verify.rows) {
      console.log(`  ${r.task_key.padEnd(28)} '${r.title}' sub_keys=${JSON.stringify(r.sub_keys)}`);
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
