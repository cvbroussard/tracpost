/**
 * Migration 155: Retire checkout from the branding pipeline.
 *
 * Per the 2026-06-12 three-milestone architecture: the branding pipeline
 * is canonically scoped to brand identity work. Subscription / Stripe
 * checkout is an INFRASTRUCTURE concern (one of the helper requirements
 * downstream consumers need), not a branding concern. It doesn't
 * influence brand identity in any way.
 *
 * checkout's observability and operator actions (suspend / reinstate /
 * billing history) move to /ops/billing (the dedicated subscription
 * surface), part of the Infrastructure milestone.
 *
 * Cleanup:
 *   1. Drop checkout entry from any downstream task's depends_on
 *      (business_info currently has ['checkout']; becomes []).
 *   2. DELETE the checkout provisioning_tasks rows across all billing
 *      accounts.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-155-retire-checkout-from-branding.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1. Re-point any downstream task that depended on checkout.
    const repointed = await c.query(`
      UPDATE provisioning_tasks
      SET depends_on = array_remove(depends_on, 'checkout')
      WHERE 'checkout' = ANY(depends_on)
      RETURNING task_key, billing_account_id, depends_on
    `);
    console.log(`✓ Dropped checkout from ${repointed.rowCount} downstream depends_on entries`);
    for (const r of repointed.rows) {
      console.log(`  ${r.task_key.padEnd(28)} → ${JSON.stringify(r.depends_on)}`);
    }

    // 2. Drop the checkout tasks themselves.
    const dropped = await c.query(`
      DELETE FROM provisioning_tasks
      WHERE task_key = 'checkout'
      RETURNING billing_account_id
    `);
    console.log(`\n✓ Dropped checkout from ${dropped.rowCount} billing accounts`);

    await c.query("COMMIT");
    console.log("\n✅ checkout retirement complete\n");

    // Verify
    const [first] = dropped.rows;
    if (first) {
      const verify = await c.query(`
        SELECT task_key, sort_order, depends_on FROM provisioning_tasks
        WHERE billing_account_id = $1 AND sort_order BETWEEN 1 AND 4
        ORDER BY sort_order
      `, [first.billing_account_id]);
      console.log("Tasks at sort 1-4 (account 1) after cleanup:");
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
