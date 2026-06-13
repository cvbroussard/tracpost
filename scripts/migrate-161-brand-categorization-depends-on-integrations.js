/**
 * Migration 161: brand_categorization gains dependency on integrations (GBP).
 *
 * brand_categorization manages the GBP categories via Pull / Generate /
 * Push actions in its drawer. None of those actions can succeed without
 * the GBP OAuth connection being established — Pull reads from Google,
 * Push writes to Google, and Generate's downstream usefulness assumes
 * the categories will land on the GBP listing. So integrations is a
 * real precondition.
 *
 * Add 'integrations' to brand_categorization.depends_on (alongside the
 * existing 'business_info'). The gating UI we built will then naturally
 * show brand_categorization as gated until GBP integration is connected.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-161-brand-categorization-depends-on-integrations.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    const updated = await c.query(`
      UPDATE provisioning_tasks
      SET depends_on = ARRAY(
        SELECT DISTINCT dep FROM (
          SELECT unnest(depends_on) AS dep
          UNION ALL
          SELECT 'integrations' AS dep
        ) d
      )
      WHERE task_key = 'brand_categorization'
        AND NOT ('integrations' = ANY(depends_on))
      RETURNING billing_account_id, depends_on
    `);
    console.log(`✓ Added integrations dep to brand_categorization on ${updated.rowCount} accounts`);
    for (const r of updated.rows) {
      console.log(`  ${r.billing_account_id} → ${JSON.stringify(r.depends_on)}`);
    }

    await c.query("COMMIT");
    console.log("\n✅ brand_categorization dep update complete\n");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("\n❌ Migration failed, rolled back:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
