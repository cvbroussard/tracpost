/**
 * Migration 147: Collapse early-stage Step 15 into a single downstream task.
 *
 * Per the strategic decision (LOCKED 2026-06-08):
 *   - Early-stage Step 15 was redundant — the URL needed for PPA/CMA is
 *     already captured in business_info.web_identity.
 *   - The substantive website provisioning work depends on a fully
 *     extracted brand identity (catalog-aware generation per
 *     [[website-generator-brand-identity-overhaul]]).
 *   - Therefore: drop the early-stage website tasks at sort 15, replace
 *     with a single downstream task gated on brand_identity_complete.
 *
 * Changes:
 *   - DELETE website_tracpost_provision (+ its 5 sub_tasks via cascade)
 *   - DELETE website_external_registered
 *   - INSERT website_provisioning at sort_order=15, owner=platform,
 *     depends_on=['brand_identity_complete']
 *   - Re-point any task that depended on the old website tasks:
 *       search_console.depends_on: 'website_tracpost_provision'
 *                                → 'website_provisioning'
 *
 * The new task's hosting-model fork behavior (not_applicable for
 * external_hosted brands) is handled by the recompute logic, not the
 * task graph. Same pattern as the old website_external_registered
 * not_applicable treatment per [[hosting-positioning]].
 *
 * The new task's drawer is a click-out to /ops/website (or its
 * eventual successor) where the full hosting metadata exposure +
 * generation pipeline trigger lives. No inline drawer scaffolding.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-147-website-provisioning-downstream.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
const { randomUUID } = require("crypto");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    const accounts = await c.query(
      "SELECT DISTINCT billing_account_id FROM provisioning_tasks ORDER BY billing_account_id",
    );
    console.log(`Found ${accounts.rows.length} billing accounts to update.\n`);

    for (const { billing_account_id } of accounts.rows) {
      console.log(`── billing_account ${billing_account_id} ──`);
      await c.query("BEGIN");
      try {
        // 1. Drop the two early-stage website tasks (sub_tasks cascade via FK).
        const dropped = await c.query(`
          DELETE FROM provisioning_tasks
          WHERE billing_account_id = $1
            AND task_key IN ('website_tracpost_provision', 'website_external_registered')
          RETURNING task_key
        `, [billing_account_id]);
        if (dropped.rowCount > 0) {
          console.log(`  ✓ dropped early-stage website tasks: ${dropped.rows.map(r => r.task_key).join(", ")}`);
        } else {
          console.log("  ⊙ no early-stage website tasks to drop");
        }

        // 2. Insert the downstream website_provisioning task.
        const exists = await c.query(
          "SELECT id FROM provisioning_tasks WHERE billing_account_id = $1 AND task_key = 'website_provisioning'",
          [billing_account_id],
        );
        if (exists.rowCount === 0) {
          await c.query(`
            INSERT INTO provisioning_tasks
              (id, billing_account_id, task_key, title, owner, depends_on, status, milestone, sort_order, step_label)
            VALUES (
              $1, $2, 'website_provisioning',
              'Website provisioning',
              'platform',
              ARRAY['brand_identity_complete']::text[],
              'pending',
              'Website live',
              15,
              'Site'
            )
          `, [randomUUID(), billing_account_id]);
          console.log("  ✓ inserted website_provisioning task at sort_order=15");
        } else {
          console.log("  ⊙ website_provisioning already exists; skipping insert");
        }

        // 3. Re-point any task that depended on the old website tasks.
        const repointed = await c.query(`
          UPDATE provisioning_tasks
          SET depends_on = ARRAY(
            SELECT DISTINCT
              CASE
                WHEN dep IN ('website_tracpost_provision', 'website_external_registered')
                THEN 'website_provisioning'
                ELSE dep
              END
            FROM unnest(depends_on) AS dep
          )
          WHERE billing_account_id = $1
            AND depends_on && ARRAY['website_tracpost_provision', 'website_external_registered']::text[]
          RETURNING task_key
        `, [billing_account_id]);
        if (repointed.rowCount > 0) {
          console.log(`  ✓ re-pointed dependencies for: ${repointed.rows.map(r => r.task_key).join(", ")}`);
        }

        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        console.error(`  ❌ rolled back: ${e.message}`);
        throw e;
      }
    }

    console.log("\n✅ website task collapse complete\n");

    // Verify final shape for one account.
    const sample = await c.query(`
      SELECT task_key, sort_order, depends_on
      FROM provisioning_tasks
      WHERE billing_account_id = $1
        AND sort_order >= 12
      ORDER BY sort_order, task_key
    `, [accounts.rows[0].billing_account_id]);
    console.log("Tasks at sort_order >= 12 (account 1):");
    for (const r of sample.rows) {
      console.log(`  ${String(r.sort_order).padStart(2)}. ${r.task_key.padEnd(32)} depends_on=${JSON.stringify(r.depends_on)}`);
    }
  } catch (e) {
    console.error("\n❌ migration failed:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
