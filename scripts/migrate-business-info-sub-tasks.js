/**
 * Migration: business_info sub_task decomposition.
 *
 * Decomposes the single-binary business_info task into 8 logical sub_tasks
 * matching the field groups on /dashboard/business + /dashboard/business/legal:
 *
 *   1. basics             (name + business_type + location)              REQUIRED
 *   2. commercial_tier    (per-site tier id, drives CMA peer filtering)  REQUIRED
 *   3. contact            (phone + email)                                optional
 *   4. branding           (logo + favicon)                               optional
 *   5. web_identity       (URL, blog URL, OG image/title/desc)           optional
 *   6. safeguard_faces    (face_waiver_signed_at)                        REQUIRED
 *   7. safeguard_minors   (minor_face_waiver_signed_at)                  REQUIRED
 *   8. safeguard_identity (identity_waiver_signed_at)                    REQUIRED
 *
 * Parent task completes when all 5 REQUIRED sub_tasks complete. Optional
 * sub_tasks show progress but don't block the parent. Decomposition matches
 * the integrations + brand-domain pattern per [[provisioning-drawer-console]].
 *
 * Idempotent per billing_account: skips brands that already have any
 * business_info sub_tasks. Transactional per brand.
 *
 * Run: node scripts/migrate-business-info-sub-tasks.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
const { randomUUID } = require("crypto");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

const SUB_TASKS = [
  { key: "basics", title: "Name, business type, location" },
  { key: "commercial_tier", title: "Commercial tier" },
  { key: "contact", title: "Phone + email" },
  { key: "branding", title: "Logo + favicon" },
  { key: "web_identity", title: "Website + blog URL + OG metadata" },
  { key: "safeguard_faces", title: "Faces policy + waiver" },
  { key: "safeguard_minors", title: "Minor faces policy + waiver" },
  { key: "safeguard_identity", title: "Identity policy + waiver" },
];

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
          console.log("  ⚠ no business_info task on this account; skipping");
          await c.query("COMMIT");
          continue;
        }
        const businessInfoTaskId = task.id;

        // Idempotency: skip if sub_tasks already exist for this task
        const existing = await c.query(
          "SELECT 1 FROM provisioning_sub_tasks WHERE task_id = $1 LIMIT 1",
          [businessInfoTaskId],
        );
        if (existing.rowCount > 0) {
          console.log("  ℹ already migrated; skipping");
          await c.query("COMMIT");
          continue;
        }

        for (let i = 0; i < SUB_TASKS.length; i++) {
          const st = SUB_TASKS[i];
          await c.query(
            `INSERT INTO provisioning_sub_tasks
              (id, task_id, sub_key, title, status, sort_order)
             VALUES ($1, $2, $3, $4, 'pending', $5)`,
            [randomUUID(), businessInfoTaskId, st.key, st.title, i + 1],
          );
          console.log(`  + sub_task ${st.key.padEnd(22)} "${st.title}"`);
        }

        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        console.error(`  ❌ rolled back: ${e.message}`);
        throw e;
      }
    }

    console.log("\n✅ business_info sub_task decomposition complete");
  } catch (e) {
    console.error("\n❌ migration failed:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
