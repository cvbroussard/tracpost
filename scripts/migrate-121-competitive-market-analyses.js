/**
 * Migration 121: competitive_market_analyses table.
 *
 * Stores TracPost's competitive intelligence reports per site — the
 * opening artifact delivered within 24-48 hours of GBP connection.
 * Per project_tracpost_competitive_market_analysis.md.
 *
 * Schema rationale:
 *   - One row per (site_id, generated_at) — keeps historical analyses
 *     for longitudinal comparison ("you moved rank 8 → 4 since onboarding")
 *   - analysis_data is JSONB to absorb evolving payload shape without
 *     migrations (we're still iterating on what the report contains)
 *   - status enum so background jobs / UI can show generation progress
 *   - error_message captures failure detail when status='failed' so we
 *     can diagnose without re-running
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("121: Create competitive_market_analyses table...");

  await sql`
    CREATE TABLE IF NOT EXISTS competitive_market_analyses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'failed')),
      analysis_data JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  + competitive_market_analyses");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_cma_site_generated
    ON competitive_market_analyses (site_id, generated_at DESC)
  `;
  console.log("  + idx_cma_site_generated (latest-analysis-per-site lookups)");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_cma_status
    ON competitive_market_analyses (status)
    WHERE status IN ('pending', 'running')
  `;
  console.log("  + idx_cma_status (background-job queue lookups)");

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'competitive_market_analyses'
    ORDER BY ordinal_position
  `;
  console.log("\n  Verified columns:");
  cols.forEach((c) => console.log(`    ${c.column_name.padEnd(20)} ${c.data_type}`));
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
