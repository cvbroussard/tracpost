/**
 * Migration: tripwire-rename businesses.brand_dna → brand_dna_legacy.
 *
 * Per [[brand-dna-retirement]] (Phase B) and the fail-aloud methodology
 * from [[db-rename-sweep-method]]: rename the column so every SQL SELECT/UPDATE
 * referencing brand_dna fails LOUDLY at runtime. Then fix each failed caller
 * per the retirement plan — readers migrate to brand_descriptor catalog via
 * getBrandPlaybookFromDescriptor() helper; writers either rewire to a future
 * catalog-driven path OR retire entirely (the brand-dna lib itself dies).
 *
 * Pre-condition: Phase A ([[brand-playbook-retirement]]) sweep is complete
 * (code reads brand_dna.playbook everywhere instead of brand_playbook).
 *
 * Reversible during the watch window via the rollback script.
 *
 * Idempotent. Transactional. Run:
 *   node scripts/migrate-tripwire-brand-dna.js
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
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='brand_dna') AS has_original,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name='brand_dna_legacy') AS has_legacy
    `);
    const { has_original, has_legacy } = check.rows[0];

    if (has_legacy) {
      console.log(`  ℹ brand_dna_legacy already exists; nothing to rename.`);
    } else if (!has_original) {
      console.log(`  ⚠ brand_dna column does not exist — nothing to rename.`);
    } else {
      await c.query(`ALTER TABLE businesses RENAME COLUMN brand_dna TO brand_dna_legacy`);
      console.log(`  ✓ businesses.brand_dna → brand_dna_legacy`);
    }

    await c.query("COMMIT");
    console.log("\n✅ tripwire migration complete");
    console.log("\nNext: boot the app + click critical flows. Every SQL ref to");
    console.log("'brand_dna' will now throw 'column does not exist'.");
    console.log("Fix each failed caller per [[brand-dna-retirement]] — readers");
    console.log("route to getBrandPlaybookFromDescriptor(siteId).");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("\n❌ migration failed:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
