/**
 * Migration 151: Retire website_provisioning as a phantom step.
 *
 * Per the audit (2026-06-11) applying the phantom step rule
 * ([[phantom-step-rule]]): website_provisioning's completion criterion
 * was just "the generator's outputs exist" (page_config + website_copy +
 * work_content populated). It produced no signal not derivable from the
 * generator's own state — it was the generator's "I ran" signal echoed
 * back into the provisioning pipeline.
 *
 * Per [[provisioning-scope]]: the provisioning pipeline is canonically
 * scoped to brand identity (steps 1-12 ending at brand_identity_complete).
 * The website generator is a downstream orchestration consumer that lives
 * at /ops/website with its own observability surface.
 *
 * Per [[brand-identity-layer-stack]]: brand identity → surface
 * implementations → rendered assets. The website is a surface
 * implementation, not part of the canonical brand identity layer.
 *
 * Cleanup:
 *   1. DROP website_provisioning tasks across all billing accounts.
 *   2. Re-point first_content's dependency from 'website_provisioning'
 *      to 'brand_identity_complete'. The "site live before publishing
 *      first content" coupling moves to the orchestration layer where
 *      it belongs — not the provisioning_tasks dep graph.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-151-retire-website-provisioning-phantom.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1. Re-point any task that depended on website_provisioning.
    //    Replace 'website_provisioning' with 'brand_identity_complete'.
    //    DISTINCT keeps duplicates away if the task already mentioned
    //    brand_identity_complete.
    const repointed = await c.query(`
      UPDATE provisioning_tasks
      SET depends_on = ARRAY(
        SELECT DISTINCT dep
        FROM (
          SELECT unnest(
            CASE
              WHEN 'website_provisioning' = ANY(depends_on)
              THEN array_remove(depends_on, 'website_provisioning') || ARRAY['brand_identity_complete']::text[]
              ELSE depends_on
            END
          ) AS dep
        ) AS d
      )
      WHERE 'website_provisioning' = ANY(depends_on)
      RETURNING task_key, billing_account_id, depends_on
    `);
    console.log(`✓ Re-pointed ${repointed.rowCount} downstream tasks`);
    for (const r of repointed.rows) {
      console.log(`  ${r.task_key.padEnd(28)} → ${JSON.stringify(r.depends_on)}`);
    }

    // 2. Drop the website_provisioning tasks (sub_tasks cascade via FK,
    //    though website_provisioning had none).
    const dropped = await c.query(`
      DELETE FROM provisioning_tasks
      WHERE task_key = 'website_provisioning'
      RETURNING billing_account_id
    `);
    console.log(`\n✓ Dropped website_provisioning from ${dropped.rowCount} billing accounts`);

    await c.query("COMMIT");
    console.log("\n✅ Phantom website_provisioning cleanup complete\n");

    // Verify
    const [first] = dropped.rows;
    if (first) {
      const verify = await c.query(`
        SELECT task_key, sort_order, depends_on FROM provisioning_tasks
        WHERE billing_account_id = $1 AND sort_order BETWEEN 10 AND 20
        ORDER BY sort_order
      `, [first.billing_account_id]);
      console.log("Tasks at sort 10-20 (account 1) after cleanup:");
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
