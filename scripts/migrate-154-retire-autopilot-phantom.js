/**
 * Migration 154: Retire autopilot as a phantom step.
 *
 * Per the audit (2026-06-11): autopilot has real canonical work (the
 * autopilot_enabled flag flip changes system behavior from manual to
 * autonomous publishing) but it belongs to the ORCHESTRATION pipeline,
 * not provisioning. Per [[provisioning-scope]]: provisioning is scoped
 * to brand identity (steps 1-12). Autopilot is the orchestration
 * pipeline's start gate — its activation conditions span MULTIPLE
 * pipelines (brand identity descriptors + raw material thresholds),
 * not just brand identity. The card on the provisioning page was
 * observational decoration of orchestration state.
 *
 * Same shape as the website_provisioning + first_content retirements:
 * real downstream concept, real signal, but belongs to a different
 * pipeline. The activation is auto-triggered from publishing events
 * (playbook saved, asset triaged, blog cron) — not the provisioning
 * surface. Observability lives at /ops/autopilot.
 *
 * Cleanup:
 *   1. DROP autopilot tasks across all billing accounts. No downstream
 *      provisioning_task depends on autopilot (it was a terminal leaf
 *      after the first_content retirement in migration 152), so no
 *      re-pointing needed.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-154-retire-autopilot-phantom.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // Safety check — if any task still depends on autopilot, surface it
    // before deleting so the operator can decide how to re-point.
    const dependents = await c.query(`
      SELECT task_key, billing_account_id, depends_on
      FROM provisioning_tasks
      WHERE 'autopilot' = ANY(depends_on)
    `);
    if (dependents.rowCount > 0) {
      console.log(`⚠ Found ${dependents.rowCount} tasks still depending on autopilot:`);
      for (const r of dependents.rows) {
        console.log(`  ${r.task_key} (${r.billing_account_id}) → ${JSON.stringify(r.depends_on)}`);
      }
      console.log("  Re-pointing — dropping the autopilot dep entry.");
      await c.query(`
        UPDATE provisioning_tasks
        SET depends_on = array_remove(depends_on, 'autopilot')
        WHERE 'autopilot' = ANY(depends_on)
      `);
    }

    // Drop the autopilot tasks themselves.
    const dropped = await c.query(`
      DELETE FROM provisioning_tasks
      WHERE task_key = 'autopilot'
      RETURNING billing_account_id
    `);
    console.log(`\n✓ Dropped autopilot from ${dropped.rowCount} billing accounts`);

    await c.query("COMMIT");
    console.log("\n✅ Phantom autopilot cleanup complete\n");

    // Verify
    const [first] = dropped.rows;
    if (first) {
      const verify = await c.query(`
        SELECT task_key, sort_order, depends_on FROM provisioning_tasks
        WHERE billing_account_id = $1 AND sort_order BETWEEN 15 AND 22
        ORDER BY sort_order
      `, [first.billing_account_id]);
      console.log("Tasks at sort 15-22 (account 1) after cleanup:");
      for (const r of verify.rows) {
        console.log(`  ${String(r.sort_order).padStart(2)}. ${r.task_key.padEnd(28)} depends_on=${JSON.stringify(r.depends_on)}`);
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
