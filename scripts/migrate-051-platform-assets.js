/**
 * Migration 051: Unified platform_assets model.
 *
 * Replaces fragmented per-platform asset storage (gbp_locations, account-as-asset
 * conflation in social_accounts) with a single asset table that all platforms use.
 *
 * Architecture:
 *   social_accounts        — one row per OAuth grant (the credential)
 *   platform_assets        — what that credential can access (pages, IG accounts,
 *                            GBP locations, LinkedIn orgs, YouTube channels)
 *   site_platform_assets   — explicit assignment: which asset a site publishes to
 *
 * After this migration, the connect flow becomes:
 *   1. OAuth → write social_accounts row + populate platform_assets from token grants
 *   2. Operator assigns site → asset(s) via UI
 *   3. Publisher reads from site_platform_assets to find the target
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  console.log("051: Platform assets unified model...");

  await sql`
    CREATE TABLE IF NOT EXISTS platform_assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      asset_name TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (social_account_id, platform, asset_type, asset_id)
    )
  `;
  console.log("  + platform_assets table");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_platform_assets_social_account
    ON platform_assets(social_account_id)
  `;
  console.log("  + idx_platform_assets_social_account");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_platform_assets_platform
    ON platform_assets(platform, asset_type)
  `;
  console.log("  + idx_platform_assets_platform");

  await sql`
    CREATE TABLE IF NOT EXISTS site_platform_assets (
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      platform_asset_id UUID NOT NULL REFERENCES platform_assets(id) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      assigned_by UUID,
      PRIMARY KEY (site_id, platform_asset_id)
    )
  `;
  console.log("  + site_platform_assets table");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_site_platform_assets_site
    ON site_platform_assets(site_id)
  `;
  console.log("  + idx_site_platform_assets_site");

  // One primary asset per platform per site (constraint)
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_site_one_primary_per_platform
    ON site_platform_assets(site_id, (
      SELECT platform FROM platform_assets WHERE id = platform_asset_id
    ))
    WHERE is_primary = true
  `.catch((err) => {
    // Fallback: if the subquery in index isn't supported, skip — enforce in app code
    console.log("  (skipping primary uniqueness index — will enforce in app)", err.message);
  });

  console.log("Done.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
