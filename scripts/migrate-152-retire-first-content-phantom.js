/**
 * Migration 152: Retire first_content as a phantom step.
 *
 * Per the audit (2026-06-11) applying the phantom step rule
 * ([[phantom-step-rule]]): first_content was pure decoration. It had:
 *
 *   - NO recompute logic (status never auto-flipped, only manual sets)
 *   - An action `trigger_generation` listed in TASK_ACTIONS but NOT
 *     wired in the action dispatcher (would fall through to "not
 *     wired yet")
 *   - A click-out to /ops/pipeline that doesn't exist
 *
 * Conceptually it was meant to mark "the moment the system goes from
 * brand setup done to actually producing content" — the first-published
 * piece milestone. But that work belongs to the orchestration / content
 * generation pipeline, not provisioning. Per [[provisioning-scope]]:
 * orchestration is a separate parallel pipeline.
 *
 * Cleanup:
 *   1. DROP first_content tasks across all billing accounts.
 *   2. Re-point autopilot's depends_on — currently
 *      ['first_content', 'gbp_location'] — to drop the first_content
 *      entry. autopilot keeps its gbp_location dep. (autopilot is a
 *      future audit candidate; this just removes the broken edge for
 *      now without prejudging that decision.)
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-152-retire-first-content-phantom.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1. Drop first_content from any downstream task's depends_on.
    const repointed = await c.query(`
      UPDATE provisioning_tasks
      SET depends_on = array_remove(depends_on, 'first_content')
      WHERE 'first_content' = ANY(depends_on)
      RETURNING task_key, billing_account_id, depends_on
    `);
    console.log(`✓ Dropped first_content from ${repointed.rowCount} downstream depends_on entries`);
    for (const r of repointed.rows) {
      console.log(`  ${r.task_key.padEnd(28)} → ${JSON.stringify(r.depends_on)}`);
    }

    // 2. Delete the first_content tasks themselves.
    const dropped = await c.query(`
      DELETE FROM provisioning_tasks
      WHERE task_key = 'first_content'
      RETURNING billing_account_id
    `);
    console.log(`\n✓ Dropped first_content from ${dropped.rowCount} billing accounts`);

    await c.query("COMMIT");
    console.log("\n✅ Phantom first_content cleanup complete\n");

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
