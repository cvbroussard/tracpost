/**
 * Migration 122: category_coaching_runs table.
 *
 * Persists each GBP-categories coaching run (the 10-best plan
 * generated from the multi-signal AI stack — see #225). Audit-trail
 * shape: one row per coaching ceremony, with status enum for in-flight
 * visibility and `applied` tracking so the operator UI can show
 * "this is the active plan vs prior plans."
 *
 * Per project_tracpost_gbp_categories_coaching memory:
 *   - Categories are infrastructure-grade reference data; coaching
 *     ceremonies are rare. Persistence is for audit + diff, not
 *     ongoing churn.
 *   - source_analysis_id FK enforces the β rule (coaching descends
 *     from a specific CMA snapshot — traceability is load-bearing).
 *   - applied flag tracks the local site_gbp_categories sync state.
 *     Push-to-Google happens via the existing dirty-flag pattern (#118),
 *     NOT inline with apply — kept consistent with current sync model.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("122: Create category_coaching_runs table...");

  await sql`
    CREATE TABLE IF NOT EXISTS category_coaching_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      source_analysis_id UUID REFERENCES competitive_market_analyses(id) ON DELETE SET NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'complete', 'failed')),
      coaching_data JSONB,
      error_message TEXT,
      applied BOOLEAN NOT NULL DEFAULT false,
      applied_at TIMESTAMPTZ,
      applied_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  + category_coaching_runs");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_ccr_site_generated
    ON category_coaching_runs (site_id, generated_at DESC)
  `;
  console.log("  + idx_ccr_site_generated (latest-run-per-site lookups)");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_ccr_status
    ON category_coaching_runs (status)
    WHERE status IN ('pending', 'running')
  `;
  console.log("  + idx_ccr_status (background-job queue lookups)");

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'category_coaching_runs'
    ORDER BY ordinal_position
  `;
  console.log("\n  Verified columns:");
  cols.forEach((c) => console.log(`    ${c.column_name.padEnd(22)} ${c.data_type}`));
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
