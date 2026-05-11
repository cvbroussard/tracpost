/**
 * Migration 112: asset_service_areas join table — completes the per-asset
 * tagging surface for the 6th tag group.
 *
 * Service areas were added in migration 109 as a per-site coverage layer
 * (canonical + overlay). Per-asset tagging was deferred at the time. With
 * the auto-tag inspector design (#205) requiring all 6 groups to have
 * per-asset descriptors, this migration wires up the join so subscribers
 * can tag specific assets with the service areas they describe.
 *
 * The join references site_service_areas.id (the OVERLAY row, not the
 * platform canonical). This matches how brands/projects/personas/branches
 * joins reference the per-site entity, not a platform-canonical entity.
 *
 * Soft-delete only per project_tracpost_deletion_policy.md — no DELETE
 * cascade beyond what the underlying tables already enforce.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("112: Creating asset_service_areas join table...");

  await sql`
    CREATE TABLE IF NOT EXISTS asset_service_areas (
      asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      site_service_area_id UUID NOT NULL REFERENCES site_service_areas(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (asset_id, site_service_area_id)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_asset_service_areas_overlay ON asset_service_areas(site_service_area_id)`;

  console.log("  + asset_service_areas join table");
  console.log("  + idx_asset_service_areas_overlay");

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'asset_service_areas'
    ORDER BY ordinal_position
  `;
  console.log("\nColumns:");
  for (const c of cols) {
    console.log(`  ${c.column_name}  ${c.data_type}`);
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
