/**
 * Add media_assets.updated_at + auto-trigger.
 *
 * Several writes around the codebase (PATCH endpoint, processBriefedAsset,
 * convertHeicAsset, poster-gen, DELETE handler) reference updated_at but
 * the column never existed. The DELETE handler 500'd in production today
 * because of this missing column; other writes were silently failing
 * (caught in surrounding try/catch and logged as non-fatal warnings, or
 * just propagating as opaque DB errors).
 *
 * Backfill: existing rows get updated_at = COALESCE(triaged_at, created_at).
 * Going forward a trigger keeps it current on every UPDATE so we don't have
 * to remember to set it in every SQL site.
 *
 * Run: node scripts/migrate-105-asset-updated-at.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Adding media_assets.updated_at column...");
  await sql`
    ALTER TABLE media_assets
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL
  `;
  console.log("  ✓ media_assets.updated_at added");

  console.log("Backfilling updated_at...");
  const result = await sql`
    UPDATE media_assets
    SET updated_at = COALESCE(triaged_at, created_at)
    WHERE updated_at IS NULL
  `;
  console.log(`  ✓ backfilled ${result.count ?? "?"} rows`);

  console.log("Installing auto-update trigger...");
  await sql`
    CREATE OR REPLACE FUNCTION media_assets_set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `;
  await sql`DROP TRIGGER IF EXISTS trg_media_assets_updated_at ON media_assets`;
  await sql`
    CREATE TRIGGER trg_media_assets_updated_at
      BEFORE UPDATE ON media_assets
      FOR EACH ROW
      EXECUTE FUNCTION media_assets_set_updated_at()
  `;
  console.log("  ✓ trigger installed (no need to set updated_at in app code)");
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
