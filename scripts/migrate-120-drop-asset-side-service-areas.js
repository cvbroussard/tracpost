/**
 * Migration 120: Drop asset-side service area tables.
 *
 * Per GBP-canonical thesis (memory/project_tracpost_service_areas_gbp_canonical.md),
 * per-asset service area tagging is obsolete. Service area attribution
 * happens JIT at orchestrator generation time:
 *   1. Pull subscriber's declared GBP service areas
 *   2. Look up cached viewports from service_areas_canonical
 *   3. Match assets by GPS viewport containment
 *   4. Fallback: match assets by transcript substring against area name
 *
 * No stored per-asset linkage. The two tables this migration drops were
 * the old per-subscriber overlay + per-asset linkage from before the
 * pivot:
 *   - asset_service_areas: per-asset → site_service_area linkage (FK cascade
 *     from site_service_areas, dropped first)
 *   - site_service_areas: per-subscriber service area overlay
 *
 * Kept:
 *   - service_areas_canonical (now serves as GBP enrichment cache — viewport,
 *     kind, place_id per place)
 *   - media_assets.gps_lat/gps_lng (asset GPS facts, consumed at JIT time)
 *
 * Code surface has already been cleaned (commit prior to this migration).
 * Verified pre-migration:
 *   - Only FK referencing these tables: asset_service_areas → site_service_areas
 *   - No production code reads from either table
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("120: Dropping asset-side service area tables...");

  await sql`DROP TABLE IF EXISTS asset_service_areas`;
  console.log("  - dropped asset_service_areas");

  await sql`DROP TABLE IF EXISTS site_service_areas`;
  console.log("  - dropped site_service_areas");

  console.log("\n  Verified service_areas_canonical retained:");
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM service_areas_canonical`;
  console.log(`    service_areas_canonical: ${count} rows`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
