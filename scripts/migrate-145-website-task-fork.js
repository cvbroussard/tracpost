/**
 * Migration 145: Website task fork by hosting_model.
 *
 * Reshapes step 15 into a fork:
 *   - Rename existing `domain_provision` → `website_tracpost_provision`
 *     ("Website (TracPost-hosted) Provisioning"). New milestone:
 *     "Website provisioned".
 *   - Drop existing `dns_config` task — fold into the renamed task as
 *     a sub_task (so the full TracPost-hosting workflow lives in one
 *     drawer per [[provisioning-drawer-console]]).
 *   - Add new task `website_external_registered` ("Website (externally
 *     hosted)") at the same sort_order tier. Single-binary: completes
 *     when the brand has declared external + Website URL populated.
 *   - Both website tasks share sort_order=15. Recompute marks the
 *     irrelevant one as 'not_applicable' based on businesses.hosting_model
 *     so subscribers only see their relevant track.
 *
 * Downstream dependency edges:
 *   - Anything that previously depended on `dns_config` or
 *     `domain_provision` now depends on `website_tracpost_provision`
 *     (or the brand-specific website task, but the simpler rule is "the
 *     unified website task").
 *
 * Sub_tasks for website_tracpost_provision (added separately, not in
 * this migration — sub_task seeding can go in a follow-up if needed):
 *   - custom_domain_provisioned
 *   - dns_verified         (was the dns_config task)
 *   - page_layout_complete
 *   - generated_copy_complete
 *   - services_derived_complete
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-145-website-task-fork.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
const { randomUUID } = require("crypto");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

const WEBSITE_TRACPOST_SUB_TASKS = [
  { key: "custom_domain_provisioned", title: "Custom domain provisioned (DNS pointed at TracPost edge)" },
  { key: "dns_verified", title: "DNS verified" },
  { key: "page_layout_complete", title: "Page layout configured (6 slots)" },
  { key: "generated_copy_complete", title: "Website copy generated" },
  { key: "services_derived_complete", title: "Services + categories derived" },
];

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
        // 1. Rename domain_provision → website_tracpost_provision
        const renameResult = await c.query(`
          UPDATE provisioning_tasks
          SET task_key = 'website_tracpost_provision',
              title = 'Website (TracPost-hosted) Provisioning',
              milestone = 'Website provisioned'
          WHERE billing_account_id = $1 AND task_key = 'domain_provision'
          RETURNING id
        `, [billing_account_id]);
        const renamedTaskId = renameResult.rows[0]?.id;
        if (renamedTaskId) {
          console.log("  ✓ renamed domain_provision → website_tracpost_provision");
        } else {
          console.log("  ⊙ no domain_provision task to rename");
        }

        // 2. Drop dns_config — its semantic role becomes the dns_verified sub_task.
        const droppedDns = await c.query(`
          DELETE FROM provisioning_tasks
          WHERE billing_account_id = $1 AND task_key = 'dns_config'
          RETURNING id
        `, [billing_account_id]);
        if (droppedDns.rowCount > 0) {
          console.log("  ✓ dropped standalone dns_config task (subsumed into sub_task)");
        }

        // 3. Add sub_tasks under the renamed task — idempotent.
        if (renamedTaskId) {
          const existing = await c.query(
            "SELECT 1 FROM provisioning_sub_tasks WHERE task_id = $1 LIMIT 1",
            [renamedTaskId],
          );
          if (existing.rowCount === 0) {
            for (let i = 0; i < WEBSITE_TRACPOST_SUB_TASKS.length; i++) {
              const st = WEBSITE_TRACPOST_SUB_TASKS[i];
              await c.query(
                `INSERT INTO provisioning_sub_tasks (id, task_id, sub_key, title, status, sort_order)
                 VALUES ($1, $2, $3, $4, 'pending', $5)`,
                [randomUUID(), renamedTaskId, st.key, st.title, i + 1],
              );
            }
            console.log(`  ✓ added ${WEBSITE_TRACPOST_SUB_TASKS.length} sub_tasks under website_tracpost_provision`);
          } else {
            console.log("  ⊙ sub_tasks already exist under website_tracpost_provision; skipping seed");
          }
        }

        // 4. Add website_external_registered task at sort_order=15 (peer to TracPost).
        const externalExists = await c.query(
          "SELECT id FROM provisioning_tasks WHERE billing_account_id = $1 AND task_key = 'website_external_registered'",
          [billing_account_id],
        );
        if (externalExists.rowCount === 0) {
          await c.query(`
            INSERT INTO provisioning_tasks
              (id, billing_account_id, task_key, title, owner, depends_on, status, milestone, sort_order, step_label)
            VALUES (
              $1, $2, 'website_external_registered',
              'Website (externally hosted)',
              'tenant',
              ARRAY['business_info']::text[],
              'pending',
              'External website on file',
              15,
              'Site'
            )
          `, [randomUUID(), billing_account_id]);
          console.log("  ✓ added website_external_registered task");
        } else {
          console.log("  ⊙ website_external_registered already exists; skipping insert");
        }

        // 5. Update downstream depends_on edges — any task that depended on
        //    'dns_config' OR 'domain_provision' should now depend on
        //    'website_tracpost_provision'. We replace in-place inside the array.
        await c.query(`
          UPDATE provisioning_tasks
          SET depends_on = ARRAY(
            SELECT DISTINCT
              CASE
                WHEN dep IN ('dns_config', 'domain_provision') THEN 'website_tracpost_provision'
                ELSE dep
              END
            FROM unnest(depends_on) AS dep
          )
          WHERE billing_account_id = $1
            AND depends_on && ARRAY['dns_config', 'domain_provision']::text[]
        `, [billing_account_id]);

        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        console.error(`  ❌ rolled back: ${e.message}`);
        throw e;
      }
    }

    console.log("\n✅ Website task fork migration complete\n");

    // Verify final state for one billing_account
    const sample = await c.query(`
      SELECT task_key, sort_order, depends_on
      FROM provisioning_tasks
      WHERE billing_account_id = $1
        AND (task_key LIKE 'website%' OR sort_order BETWEEN 14 AND 18)
      ORDER BY sort_order, task_key
    `, [accounts.rows[0].billing_account_id]);
    console.log("Final shape (account 1):");
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
