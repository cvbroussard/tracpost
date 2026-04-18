/**
 * Migration 044: Content corrections table.
 * Structured tenant feedback that feeds into generation prompts.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("044: Content corrections...");

  await sql`
    CREATE TABLE IF NOT EXISTS content_corrections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id),
      category TEXT NOT NULL,
      rule TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT 'all',
      example_before TEXT,
      example_after TEXT,
      source_note TEXT,
      is_active BOOLEAN DEFAULT true,
      created_by TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("  + content_corrections table");

  await sql`CREATE INDEX IF NOT EXISTS idx_corrections_site ON content_corrections(site_id) WHERE is_active = true`;
  console.log("  + index on site_id (active only)");

  console.log("\n044: Done.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
