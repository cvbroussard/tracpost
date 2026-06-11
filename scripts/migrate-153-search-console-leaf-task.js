/**
 * Migration 153: Reshape search_console into an agency-deliverable LEAF.
 *
 * Per the audit (2026-06-11): search_console is owner-driven (with
 * platform coaching) and represents agency obligation, not provisioning
 * gating. It's a TERMINAL leaf — no downstream depends on it, and it
 * has no real prerequisite in TracPost's pipeline either.
 *
 *   - TracPost-hosted: GSC verification logically waits for
 *     domain_provision, BUT the owner is the actor and they can see
 *     the domain status on the same page; a formal dep adds nothing.
 *   - Third-party-hosted: owner already controls their domain; the
 *     dep would be vacuous (similar to the retired website_provisioning
 *     hosting fork — phantom-signal smell).
 *
 * Dropping the dep makes search_console work the same way in both
 * hosting scenarios. The gating UI will always read "ready" — which is
 * accurate; the owner can verify anytime.
 *
 * Cleanup:
 *   1. Set search_console.depends_on to ARRAY[]::text[] across all
 *      billing accounts (was ['brand_identity_complete'] after the
 *      migration 151 re-point).
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-153-search-console-leaf-task.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    const updated = await c.query(`
      UPDATE provisioning_tasks
      SET depends_on = ARRAY[]::text[]
      WHERE task_key = 'search_console'
        AND depends_on <> ARRAY[]::text[]
      RETURNING billing_account_id
    `);
    console.log(`✓ Cleared search_console.depends_on across ${updated.rowCount} billing accounts`);

    await c.query("COMMIT");
    console.log("\n✅ search_console reshape complete\n");

    // Verify
    const [first] = updated.rows;
    if (first) {
      const verify = await c.query(`
        SELECT task_key, sort_order, depends_on FROM provisioning_tasks
        WHERE billing_account_id = $1 AND sort_order BETWEEN 15 AND 22
        ORDER BY sort_order
      `, [first.billing_account_id]);
      console.log("Tasks at sort 15-22 (account 1) after reshape:");
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
