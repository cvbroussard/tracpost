/**
 * Migration 041: GBP photo sync tracking table.
 * Tracks which media assets have been synced to the GBP gallery.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("041: GBP photo sync...");

  await sql`
    CREATE TABLE IF NOT EXISTS gbp_photo_sync (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id),
      media_asset_id UUID REFERENCES media_assets(id),
      gbp_media_name TEXT NOT NULL,
      gbp_media_url TEXT,
      source_url TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'ADDITIONAL',
      media_type TEXT NOT NULL DEFAULT 'PHOTO',
      synced_at TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("  + gbp_photo_sync table");

  await sql`CREATE INDEX IF NOT EXISTS idx_gbp_photo_sync_site ON gbp_photo_sync(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_gbp_photo_sync_asset ON gbp_photo_sync(media_asset_id)`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_gbp_photo_sync_name ON gbp_photo_sync(site_id, gbp_media_name)`;
  console.log("  + indexes");

  console.log("\n041: Done.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
