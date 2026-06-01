/**
 * Migrate (ADDITIVE, safe): widen brand_descriptor.status to support the
 * extraction harness state machine. Task #41 (extraction workflow).
 *
 *   status: NULL | declared_only | extracting | extracted | failed | stale
 *
 * Adds 'extracting' (in-flight) + 'failed' (terminal) so the async extraction
 * runner can persist per-descriptor progress + a failed terminal (the
 * variant-render lesson). Idempotent + transactional.
 * Run:  node scripts/migrate-brand-descriptor-extraction-status.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // Drop the existing status check (whatever its name), then add the widened one.
    const checks = await c.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'brand_descriptor'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%status%'
    `);
    for (const r of checks.rows) {
      await c.query(`ALTER TABLE brand_descriptor DROP CONSTRAINT ${r.conname}`);
      console.log(`  · dropped ${r.conname}`);
    }
    await c.query(`
      ALTER TABLE brand_descriptor ADD CONSTRAINT brand_descriptor_status_check
      CHECK (status IS NULL OR status IN ('declared_only','extracting','extracted','failed','stale'))
    `);
    console.log("  ✓ brand_descriptor.status CHECK = (declared_only | extracting | extracted | failed | stale)");

    await c.query("COMMIT");

    const def = (await c.query(`
      SELECT pg_get_constraintdef(oid) d FROM pg_constraint
      WHERE conrelid='brand_descriptor'::regclass AND conname='brand_descriptor_status_check'`)).rows[0]?.d;
    console.log(`\n  status check def: ${def}\nDone (additive).`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("\nFAILED — rolled back.", e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
