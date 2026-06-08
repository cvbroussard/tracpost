/**
 * Migration 144: Add hosting_model sub_task to business_info.
 *
 * Per the [[provisioning-drawer-console]] decomposition pattern.
 * 9th sub_task on business_info, REQUIRED for parent completion.
 * Sort position: between commercial_tier (#2) and contact (#3) — sits
 * with the strategic-shape declarations rather than the optional
 * contact / branding / web_identity / safeguard fields.
 *
 * After this migration the business_info sub_task layout is:
 *   1. basics             (REQUIRED)
 *   2. commercial_tier    (REQUIRED)
 *   3. hosting_model      (REQUIRED) ← NEW
 *   4. contact            (optional)
 *   5. branding           (optional)
 *   6. web_identity       (optional)
 *   7. safeguard_faces    (REQUIRED)
 *   8. safeguard_minors   (REQUIRED)
 *   9. safeguard_identity (REQUIRED)
 *
 * Idempotent — skips brands that already have a hosting_model sub_task.
 *
 * Run: node scripts/migrate-144-business-info-hosting-model-subtask.js
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
    console.log(`Found ${accounts.rows.length} billing accounts with provisioning tasks.`);

    for (const { billing_account_id } of accounts.rows) {
      console.log(`\n── billing_account ${billing_account_id} ──`);
      await c.query("BEGIN");
      try {
        const [task] = (await c.query(
          "SELECT id FROM provisioning_tasks WHERE billing_account_id = $1 AND task_key = 'business_info' LIMIT 1",
          [billing_account_id],
        )).rows;
        if (!task) {
          console.log("  ⚠ no business_info task; skipping");
          await c.query("COMMIT");
          continue;
        }
        const businessInfoTaskId = task.id;

        // Idempotency
        const existing = await c.query(
          "SELECT 1 FROM provisioning_sub_tasks WHERE task_id = $1 AND sub_key = 'hosting_model' LIMIT 1",
          [businessInfoTaskId],
        );
        if (existing.rowCount > 0) {
          console.log("  ℹ hosting_model sub_task already present; skipping");
          await c.query("COMMIT");
          continue;
        }

        // Shift sort_order for sub_tasks currently at sort_order >= 3 to make room.
        await c.query(`
          UPDATE provisioning_sub_tasks
          SET sort_order = sort_order + 1
          WHERE task_id = $1 AND sort_order >= 3
        `, [businessInfoTaskId]);

        // Insert hosting_model at sort_order 3.
        await c.query(`
          INSERT INTO provisioning_sub_tasks (id, task_id, sub_key, title, status, sort_order)
          VALUES ($1, $2, 'hosting_model', 'Hosting model (TracPost / external)', 'pending', 3)
        `, [randomUUID(), businessInfoTaskId]);
        console.log("  + sub_task hosting_model inserted at sort_order=3 (shifted others down by 1)");

        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        console.error(`  ❌ rolled back: ${e.message}`);
        throw e;
      }
    }

    console.log("\n✅ hosting_model sub_task added across all accounts");
  } catch (e) {
    console.error("\n❌ migration failed:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
