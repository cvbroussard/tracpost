/**
 * Migration 119: Make place_id unique on service_areas_canonical.
 *
 * Place ID is the canonical identity for a Google Place — two entries
 * with the same place_id should never exist as separate rows. Adding a
 * unique partial index (NULL place_id rows are still allowed for manual
 * entries that pre-date enrichment) so ON CONFLICT (place_id) becomes
 * usable in the enrichment pipeline.
 *
 * Verified pre-migration: no current duplicates to clean up.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("119: Drop non-unique partial index, add unique partial index on place_id...");

  // Drop the non-unique helper index — the new unique index covers the same query plans
  await sql`DROP INDEX IF EXISTS idx_service_areas_canonical_place_id`;
  console.log("  - idx_service_areas_canonical_place_id (non-unique)");

  // Unique partial index — ON CONFLICT (place_id) WHERE place_id IS NOT NULL works against this
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS service_areas_canonical_place_id_unique
    ON service_areas_canonical (place_id) WHERE place_id IS NOT NULL
  `;
  console.log("  + service_areas_canonical_place_id_unique");

  const idx = await sql`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE tablename = 'service_areas_canonical' AND indexname LIKE '%place_id%'
  `;
  console.log("\n  Verified:");
  idx.forEach((i) => console.log(`  ${i.indexname}\n    ${i.indexdef}`));
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
