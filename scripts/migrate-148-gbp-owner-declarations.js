/**
 * Migration 148: GBP profile declarations — step 14 reshape.
 *
 * Per the scoping discussion + the brand identity input insulation
 * doctrine ([[brand-identity-input-insulation]]):
 *   - Step 14 reframed from narrow "GBP location assigned" to the
 *     full set of owner-declared GBP profile fields.
 *   - Operator role is OBSERVE + assist (read-only drawer). Subscriber
 *     declares everything at /dashboard/google/profile.
 *   - Description and social profiles are owner-declared but INSULATED
 *     from brand catalog (one-way flow: catalog → display surfaces).
 *
 * Naming alignment:
 *   - Task slug `gbp_location` STAYS (avoids cascade refactor through
 *     recompute logic, TASK_ACTIONS map, multiple call sites).
 *   - Task title + milestone updated to reflect broader scope.
 *   - Sub_task `service_areas` (plural, explicit) — disambiguates from
 *     the overloaded "location" term per the labeling discussion.
 *   - Owner: platform → tenant (subscriber declares; operator observes).
 *
 * Sub_tasks (5 total — 3 required, 2 optional):
 *   1. service_areas         REQUIRED  (≥1, ≤20 — mirrors Google's cap)
 *   2. hours                 REQUIRED  (regularHours array populated)
 *   3. address               REQUIRED  (full structured address OR
 *                                       service-area-only declaration)
 *   4. description           optional  (owner-typed text ≤750 chars)
 *   5. social_profile_urls   optional  (GBP-display links)
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-148-gbp-owner-declarations.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
const { randomUUID } = require("crypto");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

const SUB_TASKS = [
  { key: "service_areas", title: "Service areas (Google places)" },
  { key: "hours", title: "Business hours" },
  { key: "address", title: "Address + show-on-Google toggle" },
  { key: "description", title: "Business description (owner-typed)" },
  { key: "social_profile_urls", title: "Social profile URLs (GBP display)" },
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
        // 1. Update task metadata (title + milestone + owner).
        const updated = await c.query(`
          UPDATE provisioning_tasks
          SET title = 'GBP profile declarations',
              milestone = 'GBP profile complete',
              owner = 'tenant'
          WHERE billing_account_id = $1 AND task_key = 'gbp_location'
          RETURNING id
        `, [billing_account_id]);
        const taskId = updated.rows[0]?.id;
        if (!taskId) {
          console.log("  ⊙ no gbp_location task to update");
          await c.query("COMMIT");
          continue;
        }
        console.log("  ✓ task metadata updated (title + milestone + owner=tenant)");

        // 2. Insert sub_tasks (idempotent — skip if any already present).
        const existing = await c.query(
          "SELECT COUNT(*)::int AS n FROM provisioning_sub_tasks WHERE task_id = $1",
          [taskId],
        );
        if (existing.rows[0].n > 0) {
          console.log(`  ⊙ ${existing.rows[0].n} sub_tasks already exist; skipping seed`);
        } else {
          for (let i = 0; i < SUB_TASKS.length; i++) {
            const st = SUB_TASKS[i];
            await c.query(`
              INSERT INTO provisioning_sub_tasks (id, task_id, sub_key, title, status, sort_order)
              VALUES ($1, $2, $3, $4, 'pending', $5)
            `, [randomUUID(), taskId, st.key, st.title, i + 1]);
          }
          console.log(`  ✓ inserted ${SUB_TASKS.length} sub_tasks`);
        }

        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        console.error(`  ❌ rolled back: ${e.message}`);
        throw e;
      }
    }

    console.log("\n✅ GBP profile declarations migration complete\n");

    const verify = await c.query(`
      SELECT pst.sub_key, pst.title, pst.sort_order
      FROM provisioning_sub_tasks pst
      JOIN provisioning_tasks pt ON pt.id = pst.task_id
      WHERE pt.task_key = 'gbp_location'
        AND pt.billing_account_id = $1
      ORDER BY pst.sort_order
    `, [accounts.rows[0].billing_account_id]);
    console.log("Sub_tasks under gbp_location (account 1):");
    for (const r of verify.rows) {
      console.log(`  ${r.sort_order}. ${r.sub_key.padEnd(22)} "${r.title}"`);
    }
  } catch (e) {
    console.error("\n❌ migration failed:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
