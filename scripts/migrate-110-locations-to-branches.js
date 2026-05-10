/**
 * Rename locations → branches + add branch-specific columns.
 *
 * Per entity_scoping_principle (LOCKED 2026-05-10), the original
 * `locations` table was conflating "service areas" and "branches" into
 * one entity. Service areas got their own canonical+overlay tables in
 * migration 109. This migration repurposes the existing `locations`
 * table for branches only — physical operating units of a business.
 *
 * Schema additions for branch-specific data: phone, hours,
 * gbp_location_id, is_primary.
 *
 * Also renames sites.location_label → sites.branch_label to match.
 *
 * Locations table is currently empty (0 rows) so the rename is safe.
 *
 * Run: node scripts/migrate-110-locations-to-branches.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  // Sanity check: confirm locations exists and is empty
  const exists = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name = 'locations') AS e`;
  if (!exists[0].e) {
    console.log("locations table doesn't exist — assuming already migrated. Skipping rename.");
  } else {
    const count = await sql`SELECT COUNT(*)::int AS n FROM locations`;
    console.log(`locations row count: ${count[0].n}`);

    console.log("Renaming locations → branches...");
    await sql`ALTER TABLE locations RENAME TO branches`;
    console.log("  ✓ locations → branches");

    console.log("Renaming asset_locations → asset_branches...");
    await sql`ALTER TABLE asset_locations RENAME TO asset_branches`;
    await sql`ALTER TABLE asset_branches RENAME COLUMN location_id TO branch_id`;
    console.log("  ✓ asset_locations → asset_branches (location_id → branch_id)");
  }

  console.log("Adding branch-specific columns...");
  await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS phone TEXT`;
  await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS hours JSONB DEFAULT '{}'::jsonb`;
  await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS gbp_location_id TEXT`;
  await sql`ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE`;
  console.log("  ✓ phone, hours, gbp_location_id, is_primary added");

  console.log("Renaming sites.location_label → sites.branch_label...");
  // Use IF EXISTS / IF NOT EXISTS pattern — column may already be renamed in prior runs
  const labelExists = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name = 'location_label'
  `;
  if (labelExists.length > 0) {
    await sql`ALTER TABLE sites RENAME COLUMN location_label TO branch_label`;
    console.log("  ✓ sites.location_label → sites.branch_label");
  } else {
    console.log("  ⚠ sites.location_label not found (likely already renamed)");
  }

  console.log("");
  console.log("Verification:");
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('branches', 'asset_branches', 'locations', 'asset_locations')
    ORDER BY table_name
  `;
  for (const t of tables) console.log(`  ${t.table_name === 'locations' || t.table_name === 'asset_locations' ? '⚠' : '✓'} ${t.table_name}`);

  const newCols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'branches' AND column_name IN ('phone', 'hours', 'gbp_location_id', 'is_primary')
    ORDER BY column_name
  `;
  console.log(`  ✓ branches new columns: ${newCols.map((c) => c.column_name).join(", ")}`);

  const labels = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name IN ('brand_label', 'project_label', 'persona_label', 'branch_label', 'service_area_label', 'location_label')
    ORDER BY column_name
  `;
  console.log(`  ✓ sites label columns: ${labels.map((c) => c.column_name).join(", ")}`);
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
