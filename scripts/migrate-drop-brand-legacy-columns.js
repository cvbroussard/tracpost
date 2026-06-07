/**
 * Migration: DROP COLUMN for the retired brand columns.
 *
 * Per [[brand-playbook-retirement]] (Phase A, merged PR #1) and
 * [[brand-dna-retirement]] (Phase B, merged PR #2). Both sweeps completed;
 * watch window held; no production errors observed.
 *
 * Drops:
 *   - businesses.brand_playbook_legacy   (was brand_playbook)
 *   - businesses.brand_dna_legacy        (was brand_dna)
 *   - businesses.active_brand_source     (parallel-storage flag — dead)
 *
 * DESTRUCTIVE — data is gone after this. Backups assumed to be in place
 * via Neon's point-in-time recovery if rollback is needed.
 *
 * Idempotent: skips columns that don't exist.
 *
 * Run: node scripts/migrate-drop-brand-legacy-columns.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    const columns = ["brand_playbook_legacy", "brand_dna_legacy", "active_brand_source"];
    for (const col of columns) {
      const check = await c.query(
        "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='businesses' AND column_name=$1) AS exists",
        [col],
      );
      if (check.rows[0].exists) {
        await c.query(`ALTER TABLE businesses DROP COLUMN ${col}`);
        console.log(`  ✓ dropped businesses.${col}`);
      } else {
        console.log(`  ℹ businesses.${col} does not exist; skipped`);
      }
    }

    await c.query("COMMIT");
    console.log("\n✅ legacy brand column drop complete");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("\n❌ migration failed:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
