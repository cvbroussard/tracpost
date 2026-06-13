/**
 * Migration 159: Reshape integrations task to GBP-only.
 *
 * Per the 2026-06-13 doctrine application: only GBP integration feeds
 * brand identity (via brand_categorization). The 7 social platforms
 * (Instagram, Facebook, TikTok, YouTube, Pinterest, LinkedIn, Twitter)
 * gate downstream publishing — they belong to the Infrastructure
 * milestone (Connections detail surface at /ops/connections), not
 * Branding.
 *
 * Renames the step title: "Integrations connected" → "GBP integration"
 * The previous title's "connected" was just a hardcoded label, not a
 * dynamic state. The new title makes the scope unmistakable.
 *
 * Cleanup:
 *   1. DELETE 7 social sub_task rows from integrations parent.
 *   2. Rename title.
 *
 * Operator still sees per-platform connection state on /ops/connections
 * (Infrastructure detail surface). Tenant write authority unchanged.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-159-integrations-to-gbp-only.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1. Drop the 7 social sub_task rows.
    const subDrop = await c.query(`
      DELETE FROM provisioning_sub_tasks
      WHERE sub_key IN ('instagram', 'facebook', 'tiktok', 'youtube', 'pinterest', 'linkedin', 'twitter')
        AND task_id IN (
          SELECT id FROM provisioning_tasks WHERE task_key = 'integrations'
        )
      RETURNING sub_key
    `);
    const byKey = {};
    for (const r of subDrop.rows) {
      byKey[r.sub_key] = (byKey[r.sub_key] || 0) + 1;
    }
    console.log("✓ Dropped social sub_task rows:");
    for (const k of Object.keys(byKey)) {
      console.log(`  ${k.padEnd(12)} ×${byKey[k]}`);
    }

    // 2. Rename the parent task title.
    const renamed = await c.query(`
      UPDATE provisioning_tasks
      SET title = 'GBP integration'
      WHERE task_key = 'integrations'
        AND title <> 'GBP integration'
      RETURNING billing_account_id
    `);
    console.log(`\n✓ Renamed integrations → 'GBP integration' on ${renamed.rowCount} accounts`);

    await c.query("COMMIT");
    console.log("\n✅ integrations GBP-only reshape complete\n");

    const [first] = renamed.rows;
    if (first) {
      const verify = await c.query(`
        SELECT t.task_key, t.title,
               COALESCE((SELECT json_agg(s.sub_key ORDER BY s.sort_order)
                         FROM provisioning_sub_tasks s WHERE s.task_id = t.id), '[]'::json) AS sub_keys
        FROM provisioning_tasks t
        WHERE t.billing_account_id = $1 AND t.task_key = 'integrations'
        LIMIT 1
      `, [first.billing_account_id]);
      for (const r of verify.rows) {
        console.log(`  ${r.task_key.padEnd(28)} '${r.title}'`);
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
