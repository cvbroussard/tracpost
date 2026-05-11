/**
 * Migration 114: Promote brand enrichment timestamp to a first-class
 * column for cheap idempotency checks + queryability.
 *
 * Before: enrichment timestamp lived inside `enrichment_metadata` JSONB
 * (`{"enriched_at": "2026-..."}`) — not indexable, not visible in
 * SELECTs, awkward to filter.
 *
 * After: `brands.enriched_at TIMESTAMPTZ` with backfill from the JSONB.
 *
 * Mirrors the pattern on `service_areas_canonical.enriched_at`
 * (migrate-109). Sets the foundation for multi-stage enrichment
 * (web-fetch / OG-extract / logo-capture) where each stage may want
 * its own timestamp later.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("114: Adding brands.enriched_at column...");

  await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ`;

  // Backfill from existing JSONB enrichment_metadata.enriched_at
  const result = await sql`
    UPDATE brands
    SET enriched_at = (enrichment_metadata->>'enriched_at')::timestamptz
    WHERE enriched_at IS NULL
      AND enrichment_metadata->>'enriched_at' IS NOT NULL
  `;
  console.log(`  + brands.enriched_at column`);
  console.log(`  + backfilled ${result.length ?? "?"} rows from JSONB metadata`);

  // Index for the common "find brands needing re-enrichment" query
  await sql`CREATE INDEX IF NOT EXISTS idx_brands_enriched_at ON brands(enriched_at NULLS FIRST)`;
  console.log("  + idx_brands_enriched_at (NULLS FIRST for re-enrichment scan)");

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name IN ('enriched_at', 'enrichment_status', 'enrichment_attempts', 'enrichment_metadata')
    ORDER BY column_name
  `;
  console.log("\nEnrichment columns now:");
  for (const c of cols) {
    console.log(`  ${c.column_name}  ${c.data_type}`);
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
