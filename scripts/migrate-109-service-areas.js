/**
 * service_areas: new entity type at platform scope.
 *
 * Per entity_scoping_principle (LOCKED 2026-05-10), service areas are
 * geographic regions a business serves. Universal facts (Pasadena is
 * Pasadena for everyone), so they use the canonical+overlay pattern:
 *
 *   service_areas_canonical : platform-wide place registry
 *   site_service_areas      : per-site overlay (which canonical areas
 *                              this business serves, with site-specific
 *                              metadata)
 *
 * Distinct from `branches` (per-business operating addresses) and from
 * `sites.place_id` (the canonical primary address). Service areas =
 * geographic reach; branches = physical operating units.
 *
 * Adds sites.service_area_label for the entity-label customization
 * system (parallels brand_label, project_label, etc.).
 *
 * Run: node scripts/migrate-109-service-areas.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Creating service_areas_canonical (platform-wide registry)...");
  await sql`
    CREATE TABLE IF NOT EXISTS service_areas_canonical (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL CHECK (kind IN ('city', 'county', 'zip', 'region', 'state', 'metro', 'neighborhood')),
      parent_region_id UUID REFERENCES service_areas_canonical(id) ON DELETE SET NULL,
      place_id TEXT,
      boundary_geojson JSONB,
      enriched_at TIMESTAMPTZ,
      enrichment_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  ✓ service_areas_canonical created");

  await sql`CREATE INDEX IF NOT EXISTS idx_service_areas_canonical_kind ON service_areas_canonical (kind)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_service_areas_canonical_parent ON service_areas_canonical (parent_region_id) WHERE parent_region_id IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_service_areas_canonical_place_id ON service_areas_canonical (place_id) WHERE place_id IS NOT NULL`;
  console.log("  ✓ canonical indexes created");

  console.log("Creating site_service_areas (per-site overlay)...");
  await sql`
    CREATE TABLE IF NOT EXISTS site_service_areas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      service_area_canonical_id UUID NOT NULL REFERENCES service_areas_canonical(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      hero_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
      site_notes TEXT,
      custom_description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (site_id, service_area_canonical_id)
    )
  `;
  console.log("  ✓ site_service_areas created");

  await sql`CREATE INDEX IF NOT EXISTS idx_site_service_areas_site ON site_service_areas (site_id) WHERE is_active = TRUE`;
  console.log("  ✓ overlay indexes created");

  console.log("Adding updated_at trigger on site_service_areas...");
  await sql`
    CREATE OR REPLACE FUNCTION site_service_areas_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;
  await sql`DROP TRIGGER IF EXISTS trg_site_service_areas_updated_at ON site_service_areas`;
  await sql`
    CREATE TRIGGER trg_site_service_areas_updated_at
      BEFORE UPDATE ON site_service_areas
      FOR EACH ROW
      EXECUTE FUNCTION site_service_areas_set_updated_at()
  `;
  console.log("  ✓ trigger installed");

  console.log("Adding sites.service_area_label for entity-label customization...");
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS service_area_label TEXT`;
  console.log("  ✓ sites.service_area_label added");

  console.log("");
  console.log("Verification:");
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('service_areas_canonical', 'site_service_areas')
    ORDER BY table_name
  `;
  for (const t of tables) console.log(`  ✓ ${t.table_name}`);
  const labelCol = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name = 'service_area_label'
  `;
  console.log(`  ✓ sites.service_area_label: ${labelCol.length > 0 ? "exists" : "MISSING"}`);
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
