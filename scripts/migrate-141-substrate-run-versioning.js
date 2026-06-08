/**
 * Migration 141: Substrate run versioning.
 *
 * Adds run_number to business_substrate to enable APPEND-pattern for
 * kinds that need historical run tracking (PPA, readiness_findings).
 *
 * Per [[ppa-cma-recurring-quality-gate]]: PPA + CMA + findings are
 * recurring measurement passes, not one-shot. The substrate row was
 * overwriting on regenerate — this migration preserves history.
 *
 * Schema changes:
 *   - ADD COLUMN run_number INTEGER NOT NULL DEFAULT 1
 *   - DROP unique constraint on (business_id, kind)
 *   - ADD unique constraint on (business_id, kind, run_number)
 *
 * Existing rows all become run_number=1 (default). Non-versioned kinds
 * continue to upsert against run_number=1 cleanly; versioned kinds
 * (PPA, findings) switch to append via appendSubstrate() in code.
 *
 * Run: node scripts/migrate-141-substrate-run-versioning.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1. Add run_number column with default 1 (backfills all existing rows)
    console.log("→ ADD COLUMN run_number");
    await c.query(`
      ALTER TABLE business_substrate
      ADD COLUMN IF NOT EXISTS run_number INTEGER NOT NULL DEFAULT 1
    `);

    // 2. Drop the old unique constraint on (business_id, kind).
    //    Note: it was created as a UNIQUE INDEX, not a CONSTRAINT, so we drop the index.
    console.log("→ DROP INDEX uq_business_substrate_kind");
    await c.query(`DROP INDEX IF EXISTS uq_business_substrate_kind`);

    // 3. Add new unique constraint on (business_id, kind, run_number).
    //    Non-versioned kinds keep writing run_number=1 so their upsert
    //    semantics work unchanged. Versioned kinds insert MAX+1 each run.
    console.log("→ CREATE UNIQUE INDEX uq_business_substrate_kind_run");
    await c.query(`
      CREATE UNIQUE INDEX uq_business_substrate_kind_run
        ON business_substrate (business_id, kind, run_number)
    `);

    // 4. Index for "latest run" lookup (kind + run_number DESC)
    console.log("→ CREATE INDEX idx_business_substrate_latest");
    await c.query(`
      CREATE INDEX IF NOT EXISTS idx_business_substrate_latest
        ON business_substrate (business_id, kind, run_number DESC)
    `);

    await c.query("COMMIT");
    console.log("\n✅ Migration 141 complete");

    // Sanity check
    const sample = await c.query(`
      SELECT kind, COUNT(*)::int AS row_count, MIN(run_number) AS min_run, MAX(run_number) AS max_run
      FROM business_substrate GROUP BY kind ORDER BY kind
    `);
    console.log("\nSubstrate kinds by run distribution:");
    for (const r of sample.rows) {
      console.log(`  ${r.kind.padEnd(40)} ${r.row_count} rows  (run ${r.min_run}..${r.max_run})`);
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
