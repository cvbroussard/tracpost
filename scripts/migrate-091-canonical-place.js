/**
 * Migration 091: Canonical place per business.
 *
 * Adds the single source of truth for business location to the sites table.
 * Per project_tracpost_canonical_place memory — this consolidates 7+
 * scattered location representations (sites.location text, FB Page lat/lon
 * cache, GBP location, ad targeting center, website hero, schema markup,
 * Reach defaults) into one canonical row that every surface reads from.
 *
 * Additive only — no destructive changes. Existing sites get NULL canonical
 * fields and continue using the legacy cascade (FB Page lat/lon → sites.location
 * → geocode-on-demand) until subscribers explicitly set their canonical place
 * via the Reach step or Configure → Business Location.
 *
 * Schema additions:
 *   - sites.place_id                   TEXT       — Google Place ID (canonical)
 *   - sites.place_lat                  NUMERIC(9,6)
 *   - sites.place_lon                  NUMERIC(9,6)
 *   - sites.place_name                 TEXT       — formatted "Pittsburgh, PA, USA"
 *   - sites.place_set_at               TIMESTAMPTZ
 *   - sites.reach_default_radius_miles INT DEFAULT 10
 *   - sites.service_area_radius_miles  INT        — for website "we serve" display (separate from Reach)
 *
 * Per-post Reach overrides (transient, never touch canonical) live on the
 * existing social_posts.metadata JSONB field — no schema change needed for
 * those. Reach step writes metadata.reach_override at publish time.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("091: canonical place per business...");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS place_id TEXT`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS place_lat NUMERIC(9,6)`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS place_lon NUMERIC(9,6)`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS place_name TEXT`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS place_set_at TIMESTAMPTZ`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS reach_default_radius_miles INT DEFAULT 10`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS service_area_radius_miles INT`;

  console.log("  + sites.place_id (TEXT, nullable, Google Place ID)");
  console.log("  + sites.place_lat / place_lon (NUMERIC, nullable)");
  console.log("  + sites.place_name (TEXT, nullable, formatted display name)");
  console.log("  + sites.place_set_at (TIMESTAMPTZ, when canonical was set)");
  console.log("  + sites.reach_default_radius_miles (INT, default 10)");
  console.log("  + sites.service_area_radius_miles (INT, nullable — website display)");

  // Index on place_id for any cross-business deduplication queries
  await sql`CREATE INDEX IF NOT EXISTS idx_sites_place_id ON sites(place_id) WHERE place_id IS NOT NULL`;
  console.log("  + idx_sites_place_id (partial, only WHERE place_id IS NOT NULL)");

  // Verification
  const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM sites`;
  const [{ with_canonical }] = await sql`
    SELECT COUNT(*)::int AS with_canonical FROM sites WHERE place_id IS NOT NULL
  `;
  console.log(`\n✓ Migration 091 complete. ${total} sites total; ${with_canonical} with canonical place set.`);
  console.log("  Sites without canonical fall through the cascade:");
  console.log("    1. sites.place_id (NULL → next)");
  console.log("    2. FB Page lat/lon (cached in platform_assets.metadata)");
  console.log("    3. sites.location (legacy free-form text → geocode on demand)");
  console.log("    4. Prompt subscriber if all empty");
}

migrate().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
