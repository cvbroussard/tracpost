/**
 * Rollback: rename businesses.brand_playbook_legacy → brand_playbook.
 *
 * Reverses scripts/migrate-tripwire-brand-playbook.js. Use during the
 * Phase A sweep window if the rename causes unexpected breakage that
 * can't be fixed forward. Not destructive — the column data is preserved
 * through the rename.
 *
 * Run: node scripts/migrate-tripwire-brand-playbook-rollback.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    const check = await c.query(`
      SELECT
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='brand_playbook') AS has_original,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='brand_playbook_legacy') AS has_legacy
    `);
    const { has_original, has_legacy } = check.rows[0];

    if (has_original) {
      console.log(`  ℹ brand_playbook already exists; rollback not needed.`);
    } else if (!has_legacy) {
      console.log(`  ⚠ brand_playbook_legacy does not exist — nothing to roll back.`);
    } else {
      await c.query(`ALTER TABLE businesses RENAME COLUMN brand_playbook_legacy TO brand_playbook`);
      console.log(`  ✓ businesses.brand_playbook_legacy → brand_playbook`);
    }

    await c.query("COMMIT");
    console.log("\n✅ rollback complete");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("\n❌ rollback failed:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
