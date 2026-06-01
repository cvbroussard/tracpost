/**
 * Migrate (ADDITIVE, safe): add brand_descriptor.metadata (jsonb).
 *
 * General-purpose per-descriptor metadata column. First use: baseline opt-outs
 * for guardrail descriptors (`avoid`, later `do_not_show`) — checkbox rows of
 * baseline term sets that default to ON; the owner unchecks what doesn't apply
 * and the opt-out list is namespaced under metadata.baselineOptOuts.
 *
 * Idempotent + transactional.
 * Run:  node scripts/migrate-brand-descriptor-metadata.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`ALTER TABLE brand_descriptor ADD COLUMN IF NOT EXISTS metadata JSONB`);
    console.log("  ✓ brand_descriptor.metadata (jsonb)");
    await c.query("COMMIT");
    const has = (await c.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name='brand_descriptor' AND column_name='metadata'`)).rows.length > 0;
    console.log(`\n  metadata column present: ${has}\nDone (additive).`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("\nFAILED — rolled back.", e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
