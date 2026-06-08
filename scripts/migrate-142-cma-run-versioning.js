/**
 * Migration 142: CMA run versioning columns.
 *
 * Per [[ppa-cma-recurring-quality-gate]] step 5. Adds explicit run
 * sequence + intent metadata to competitive_market_analyses, so the
 * UI can distinguish diagnostic baseline from verification re-runs
 * and link each run to the catalog/website state it measured against.
 *
 * Existing rows backfill:
 *   - run_number: dense-ranked per business by generated_at ASC
 *   - run_purpose: 'diagnostic' for run 1; 'ad_hoc' for runs ≥ 2 (we
 *     can't infer intent from historical data; ad_hoc is the neutral
 *     fallback). New runs going forward pass run_purpose at trigger time.
 *   - catalog_snapshot_at: NULL (historical — we didn't capture this)
 *   - website_last_regen_at: NULL (same)
 *
 * Run: node scripts/migrate-142-cma-run-versioning.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    console.log("→ ADD COLUMN run_number");
    await c.query(`
      ALTER TABLE competitive_market_analyses
      ADD COLUMN IF NOT EXISTS run_number INTEGER
    `);

    console.log("→ ADD COLUMN run_purpose");
    await c.query(`
      ALTER TABLE competitive_market_analyses
      ADD COLUMN IF NOT EXISTS run_purpose TEXT
    `);

    console.log("→ ADD COLUMN catalog_snapshot_at");
    await c.query(`
      ALTER TABLE competitive_market_analyses
      ADD COLUMN IF NOT EXISTS catalog_snapshot_at TIMESTAMPTZ
    `);

    console.log("→ ADD COLUMN website_last_regen_at");
    await c.query(`
      ALTER TABLE competitive_market_analyses
      ADD COLUMN IF NOT EXISTS website_last_regen_at TIMESTAMPTZ
    `);

    // Backfill run_number using dense_rank() over generated_at within each business
    console.log("→ backfilling run_number");
    await c.query(`
      WITH ranked AS (
        SELECT id,
               DENSE_RANK() OVER (PARTITION BY business_id ORDER BY generated_at ASC) AS rn
        FROM competitive_market_analyses
      )
      UPDATE competitive_market_analyses cma
      SET run_number = ranked.rn
      FROM ranked
      WHERE cma.id = ranked.id AND cma.run_number IS NULL
    `);

    // Backfill run_purpose
    console.log("→ backfilling run_purpose");
    await c.query(`
      UPDATE competitive_market_analyses
      SET run_purpose = CASE
        WHEN run_number = 1 THEN 'diagnostic'
        ELSE 'ad_hoc'
      END
      WHERE run_purpose IS NULL
    `);

    // Add the CHECK constraint after backfill
    console.log("→ ADD CHECK run_purpose IN (diagnostic, verification, ad_hoc)");
    await c.query(`
      ALTER TABLE competitive_market_analyses
      ADD CONSTRAINT cma_run_purpose_check
      CHECK (run_purpose IN ('diagnostic', 'verification', 'ad_hoc'))
    `);

    // NOT NULL on run_number + run_purpose (now that backfilled)
    console.log("→ SET NOT NULL on run_number, run_purpose");
    await c.query(`
      ALTER TABLE competitive_market_analyses
      ALTER COLUMN run_number SET NOT NULL,
      ALTER COLUMN run_purpose SET NOT NULL
    `);

    // Unique (business_id, run_number)
    console.log("→ CREATE UNIQUE INDEX uq_cma_business_run");
    await c.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_cma_business_run
        ON competitive_market_analyses (business_id, run_number)
    `);

    // Index for "latest run" lookups
    console.log("→ CREATE INDEX idx_cma_latest");
    await c.query(`
      CREATE INDEX IF NOT EXISTS idx_cma_latest
        ON competitive_market_analyses (business_id, run_number DESC)
    `);

    await c.query("COMMIT");
    console.log("\n✅ Migration 142 complete");

    // Verification
    const verify = await c.query(`
      SELECT business_id, COUNT(*)::int AS runs, MIN(run_number) AS min_run, MAX(run_number) AS max_run,
             ARRAY_AGG(DISTINCT run_purpose ORDER BY run_purpose) AS purposes
      FROM competitive_market_analyses
      GROUP BY business_id
    `);
    console.log("\nCMA runs by business:");
    for (const r of verify.rows) {
      console.log(`  ${r.business_id.slice(0, 8)}: ${r.runs} runs (run ${r.min_run}..${r.max_run}) purposes=[${r.purposes.join(", ")}]`);
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
