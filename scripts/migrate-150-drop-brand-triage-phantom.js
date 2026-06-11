/**
 * Migration 150: Drop brand_triage as a pipeline step (phantom step rule).
 *
 * Per the phantom step rule (LOCKED 2026-06-11,
 * [[phantom-step-rule]]): a pipeline step must produce a signal not
 * derivable from upstream alone. brand_triage fails this test:
 *   - Its only "output" is a categorical tag (type_a|b|c|d).
 *   - The tag is computed by PPA's LLM call as payload.meta.verdict.
 *   - No standalone triage runner, no separate substrate kind.
 *   - No downstream code consumes the verdict to drive decisions.
 *   - Completion criterion identical to "PPA done AND CMA done" —
 *     already encoded in the dependency graph.
 *
 * Cleanup:
 *   1. DROP brand_triage tasks across all billing accounts.
 *   2. Re-point any task that depended on brand_triage to depend
 *      directly on the actual signal sources: brand_public_presence
 *      AND brand_cma. (brand_readiness_findings is the one task that
 *      currently depends on brand_triage per the dependency graph.)
 *
 * The verdict tag remains in PPA's payload.meta.verdict — no change.
 * The display of the verdict remains in PPA's observation view — no
 * change. Only the empty pipeline step is removed.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-150-drop-brand-triage-phantom.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1. Re-point any downstream task that depends on brand_triage.
    //    Replace 'brand_triage' with both 'brand_public_presence' AND
    //    'brand_cma' (the actual signal sources). DISTINCT keeps duplicates
    //    away if the task already mentioned either.
    const repointed = await c.query(`
      UPDATE provisioning_tasks
      SET depends_on = ARRAY(
        SELECT DISTINCT dep
        FROM (
          SELECT unnest(
            CASE
              WHEN 'brand_triage' = ANY(depends_on)
              THEN array_remove(depends_on, 'brand_triage') || ARRAY['brand_public_presence', 'brand_cma']::text[]
              ELSE depends_on
            END
          ) AS dep
        ) AS d
      )
      WHERE 'brand_triage' = ANY(depends_on)
      RETURNING task_key, billing_account_id, depends_on
    `);
    console.log(`✓ Re-pointed ${repointed.rowCount} downstream tasks`);
    for (const r of repointed.rows) {
      console.log(`  ${r.task_key.padEnd(28)} → ${JSON.stringify(r.depends_on)}`);
    }

    // 2. Drop the brand_triage tasks (sub_tasks cascade via FK).
    const dropped = await c.query(`
      DELETE FROM provisioning_tasks
      WHERE task_key = 'brand_triage'
      RETURNING billing_account_id
    `);
    console.log(`\n✓ Dropped brand_triage from ${dropped.rowCount} billing accounts`);

    await c.query("COMMIT");
    console.log("\n✅ Phantom brand_triage cleanup complete\n");

    // Verify
    const [first] = dropped.rows;
    if (first) {
      const verify = await c.query(`
        SELECT task_key, sort_order, depends_on FROM provisioning_tasks
        WHERE billing_account_id = $1 AND sort_order BETWEEN 3 AND 8
        ORDER BY sort_order
      `, [first.billing_account_id]);
      console.log("Tasks at sort 3-8 (account 1) after cleanup:");
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
