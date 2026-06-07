/**
 * Migration: tripwire-rename businesses.brand_playbook → brand_playbook_legacy.
 *
 * Per [[brand-playbook-retirement]] (Phase A) and the fail-aloud methodology
 * from [[db-rename-sweep-method]]: rename the column so every SQL SELECT/UPDATE
 * referencing brand_playbook fails LOUDLY at runtime. Then fix each failed
 * caller per the retirement plan — readers migrate to brand_dna.playbook;
 * wizard writers either rewire to brand-identity catalog OR retire entirely.
 *
 * This script is reversible during the watch window — the destructive
 * DROP COLUMN happens in a separate later script.
 *
 * Idempotent. Transactional. Run:
 *   node scripts/migrate-tripwire-brand-playbook.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // Check current state. The rename is idempotent — only fires if the
    // legacy column doesn't exist yet.
    const check = await c.query(`
      SELECT
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='brand_playbook') AS has_original,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='brand_playbook_legacy') AS has_legacy
    `);
    const { has_original, has_legacy } = check.rows[0];

    if (has_legacy) {
      console.log(`  ℹ brand_playbook_legacy already exists; nothing to rename.`);
    } else if (!has_original) {
      console.log(`  ⚠ brand_playbook column does not exist — nothing to rename.`);
    } else {
      await c.query(`ALTER TABLE businesses RENAME COLUMN brand_playbook TO brand_playbook_legacy`);
      console.log(`  ✓ businesses.brand_playbook → brand_playbook_legacy`);
    }

    await c.query("COMMIT");
    console.log("\n✅ tripwire migration complete");
    console.log("\nNext: boot the app + click critical flows. Every SQL ref to");
    console.log("'brand_playbook' will now throw 'column does not exist'.");
    console.log("Fix each failed caller per [[brand-playbook-retirement]].");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("\n❌ migration failed:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
