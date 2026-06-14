/**
 * Migration 165: Reshape business_info sub_tasks to 4 flat fields.
 *
 * Per the 2026-06-14 doctrine: the business_info card surfaces the
 * Cat 1 load-bearing baseline only — name, business_type, location, URL.
 * Cat 2 sub_tasks (commercial_tier, hosting_model, contact, branding,
 * 3 safeguards, web_identity bundle) have been re-homed to their
 * consumer cards per Cat 1 Home Rule. Logo + favicon moved to the
 * Website card. The previous 9-sub_task model is collapsed to 4 flat
 * field-level sub_tasks so the drawer and the card badge reflect the
 * same surface (X/4 completion).
 *
 * For each business_info task: drop all existing sub_tasks; insert
 * 4 new ones (name, business_type, location, url) with statuses
 * derived from the current column values on businesses.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-165-business-info-flat-sub-tasks.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
const { randomUUID } = require("crypto");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

const NEW_SUBS = [
  { sub_key: "name", title: "Business name", sort_order: 1, column: "name" },
  { sub_key: "business_type", title: "Business type", sort_order: 2, column: "business_type" },
  { sub_key: "location", title: "Location", sort_order: 3, column: "location" },
  { sub_key: "url", title: "Website URL", sort_order: 4, column: "url" },
];

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    const tasks = (await c.query(`
      SELECT pt.id AS task_id, pt.billing_account_id, s.id AS business_id,
             s.name, s.business_type, s.location, s.url
      FROM provisioning_tasks pt
      JOIN businesses s ON s.billing_account_id = pt.billing_account_id
      WHERE pt.task_key = 'business_info'
    `)).rows;

    if (!tasks.length) {
      console.log("No business_info provisioning_tasks found. Nothing to do.");
      return;
    }
    console.log(`Found ${tasks.length} business_info task(s) across accounts.`);

    let droppedTotal = 0;
    let insertedTotal = 0;

    for (const row of tasks) {
      await c.query("BEGIN");
      try {
        // Already-flat: skip if all 4 keys present and nothing else.
        const existing = (await c.query(`
          SELECT sub_key FROM provisioning_sub_tasks WHERE task_id = $1 ORDER BY sort_order
        `, [row.task_id])).rows.map(r => r.sub_key);
        const targetKeys = NEW_SUBS.map(s => s.sub_key);
        const alreadyFlat =
          existing.length === targetKeys.length &&
          existing.every((k, i) => k === targetKeys[i]);

        if (alreadyFlat) {
          console.log(`  ℹ ${row.business_id} already flat; skipping`);
          await c.query("COMMIT");
          continue;
        }

        // Drop existing sub_tasks
        const dropped = await c.query(`
          DELETE FROM provisioning_sub_tasks WHERE task_id = $1 RETURNING sub_key
        `, [row.task_id]);
        droppedTotal += dropped.rowCount;

        // Insert 4 new flat sub_tasks. Status derived from current column value.
        for (const sub of NEW_SUBS) {
          const value = row[sub.column];
          const present = typeof value === "string" && value.trim().length > 0;
          await c.query(`
            INSERT INTO provisioning_sub_tasks
              (id, task_id, sub_key, title, status, sort_order, completed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            randomUUID(),
            row.task_id,
            sub.sub_key,
            sub.title,
            present ? "complete" : "pending",
            sub.sort_order,
            present ? new Date() : null,
          ]);
          insertedTotal++;
        }

        await c.query("COMMIT");
        console.log(`  ✓ ${row.business_id}: dropped ${dropped.rowCount}, inserted ${NEW_SUBS.length}`);
      } catch (e) {
        await c.query("ROLLBACK");
        console.error(`  ❌ ${row.business_id} rolled back: ${e.message}`);
        throw e;
      }
    }

    console.log(`\n✅ Reshape complete — dropped ${droppedTotal} legacy sub_task rows, inserted ${insertedTotal} flat rows\n`);

    // Verify on first row
    if (tasks[0]) {
      const verify = (await c.query(`
        SELECT sub_key, title, status, sort_order
        FROM provisioning_sub_tasks
        WHERE task_id = $1
        ORDER BY sort_order
      `, [tasks[0].task_id])).rows;
      console.log(`Verification on first task (${tasks[0].business_id}):`);
      for (const r of verify) {
        console.log(`  ${String(r.sort_order).padEnd(2)} ${r.sub_key.padEnd(16)} ${r.status.padEnd(10)} '${r.title}'`);
      }
    }
  } finally {
    c.release();
    await pool.end();
  }
})();
