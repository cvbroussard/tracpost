/**
 * Migration 118: Repair + enforce gbp dirty-state coherence.
 *
 * gbp_sync_dirty (boolean) and gbp_dirty_fields (text[]) must always
 * agree: dirty=true requires the array to be non-empty, and an empty
 * array requires dirty=false. Two structural bugs left some sites
 * (notably B²) in the incoherent state dirty=true, fields=[]:
 *
 *   1. syncProfileFromGoogle initial-sync branch wrote gbp_profile
 *      without touching dirty state.
 *   2. The unified connection-assignment path /api/admin/platform-assets/assign
 *      didn't trigger a fresh sync, so prior dirty state persisted.
 *
 * Both code paths are fixed in this commit. This migration:
 *   1. Repairs existing rows in the incoherent state (dirty=true with
 *      empty fields array → dirty=false).
 *   2. Adds a CHECK constraint so the state can never recur silently.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("118: Repairing incoherent gbp dirty state...");
  const repaired = await sql`
    UPDATE sites
    SET gbp_sync_dirty = false
    WHERE gbp_sync_dirty = true
      AND COALESCE(array_length(gbp_dirty_fields, 1), 0) = 0
    RETURNING id, name
  `;
  console.log(`  + repaired ${repaired.length} site(s)`);
  for (const s of repaired) {
    console.log(`    - ${s.name} (${s.id})`);
  }

  console.log("\n  Adding CHECK constraint sites_gbp_dirty_coherent...");
  const [existing] = await sql`
    SELECT 1 AS yes FROM pg_constraint WHERE conname = 'sites_gbp_dirty_coherent'
  `;
  if (existing) {
    console.log("  = constraint already exists, skipping");
  } else {
    await sql`
      ALTER TABLE sites
      ADD CONSTRAINT sites_gbp_dirty_coherent
      CHECK (NOT (gbp_sync_dirty = true AND COALESCE(array_length(gbp_dirty_fields, 1), 0) = 0))
    `;
    console.log("  + sites_gbp_dirty_coherent");
  }

  const [verify] = await sql`
    SELECT pg_catalog.pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conname = 'sites_gbp_dirty_coherent'
  `;
  console.log("\n  Verified:");
  console.log(`  ${verify.def}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
