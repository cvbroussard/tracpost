/**
 * Rollback: rename businesses.brand_dna_legacy → brand_dna.
 *
 * Reverses scripts/migrate-tripwire-brand-dna.js. Use during the
 * Phase B sweep window if the rename causes unexpected breakage that
 * can't be fixed forward. Not destructive — the column data is preserved
 * through the rename.
 *
 * Run: node scripts/migrate-tripwire-brand-dna-rollback.js
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

    if (has_original) {
      console.log(`  ℹ brand_dna already exists; rollback not needed.`);
    } else if (!has_legacy) {
      console.log(`  ⚠ brand_dna_legacy does not exist — nothing to roll back.`);
    } else {
      await c.query(`ALTER TABLE businesses RENAME COLUMN brand_dna_legacy TO brand_dna`);
      console.log(`  ✓ businesses.brand_dna_legacy → brand_dna`);
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
