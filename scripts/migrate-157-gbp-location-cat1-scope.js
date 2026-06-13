/**
 * Migration 157: Reshape gbp_location step to Category 1 scope only.
 *
 * Per the 2026-06-13 GBP-field-categorization doctrine:
 *   - Cat 1 (shapes brand identity) → Branding pipeline only
 *   - Cat 2 (best practices) → Infrastructure pipeline only
 *   - Cat 3 (neither) → not surfaced on operator UI at all
 *
 * Step 14 (gbp_location) was tracking 5 GBP profile fields as sub_tasks:
 *   service_areas (Cat 1) — KEEP
 *   hours (Cat 2)         — DROP from Branding (moves to Infrastructure GBP card)
 *   address (Cat 2)       — DROP from Branding (moves to Infrastructure GBP card)
 *   description (Cat 2)   — DROP from Branding (moves to Infrastructure GBP card)
 *   social_profile_urls (Cat 3) — DROP from operator UI entirely
 *
 * Also: rename the parent task title to reflect the narrower Cat-1 scope.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-157-gbp-location-cat1-scope.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1. Drop the 4 Cat 2 / Cat 3 sub_tasks from gbp_location.
    const subDrop = await c.query(`
      DELETE FROM provisioning_sub_tasks
      WHERE sub_key IN ('hours', 'address', 'description', 'social_profile_urls')
        AND task_id IN (
          SELECT id FROM provisioning_tasks WHERE task_key = 'gbp_location'
        )
      RETURNING sub_key
    `);
    const dropByKey = {};
    for (const r of subDrop.rows) {
      dropByKey[r.sub_key] = (dropByKey[r.sub_key] || 0) + 1;
    }
    console.log("✓ Dropped sub_task rows:");
    for (const k of Object.keys(dropByKey)) {
      console.log(`  ${k.padEnd(22)} ×${dropByKey[k]}`);
    }

    // 2. Rename the parent task title to reflect the narrower Cat-1 scope.
    const renamed = await c.query(`
      UPDATE provisioning_tasks
      SET title = 'GBP brand identity'
      WHERE task_key = 'gbp_location'
        AND title <> 'GBP brand identity'
      RETURNING billing_account_id
    `);
    console.log(`\n✓ Renamed gbp_location → 'GBP brand identity' on ${renamed.rowCount} accounts`);

    await c.query("COMMIT");
    console.log("\n✅ gbp_location Cat-1 scoping complete\n");

    // Verify
    const [first] = renamed.rows;
    if (first) {
      const verify = await c.query(`
        SELECT t.task_key, t.title, t.sort_order,
               COALESCE((SELECT json_agg(s.sub_key ORDER BY s.sort_order)
                         FROM provisioning_sub_tasks s WHERE s.task_id = t.id), '[]'::json) AS sub_keys
        FROM provisioning_tasks t
        WHERE t.billing_account_id = $1 AND t.task_key = 'gbp_location'
        LIMIT 1
      `, [first.billing_account_id]);
      console.log("gbp_location after reshape:");
      for (const r of verify.rows) {
        console.log(`  ${String(r.sort_order).padStart(2)}. ${r.task_key} ('${r.title}')`);
        console.log(`     sub_keys: ${JSON.stringify(r.sub_keys)}`);
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
