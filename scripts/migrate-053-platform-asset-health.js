/**
 * Migration 053: Asset health tracking on platform_assets.
 *
 * Adds:
 *   - health_status         — current state of this asset's reachability
 *   - health_checked_at     — when we last verified it
 *   - health_error          — most recent error from the platform check
 *   - health_blast_radius   — cached count of sites this asset serves
 *
 * Status values:
 *   healthy           — token valid + asset reachable + permissions intact
 *   permission_lost   — token valid but no longer has permission for this asset
 *   token_expired     — parent token expired/revoked, asset unusable
 *   unreachable       — asset itself missing or platform API rejected the lookup
 *   unknown           — never checked, or check failed for transient reasons
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  console.log("053: Platform asset health...");

  await sql`
    ALTER TABLE platform_assets
    ADD COLUMN IF NOT EXISTS health_status TEXT NOT NULL DEFAULT 'unknown'
  `;
  console.log("  + health_status");

  await sql`
    ALTER TABLE platform_assets
    ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ
  `;
  console.log("  + health_checked_at");

  await sql`
    ALTER TABLE platform_assets
    ADD COLUMN IF NOT EXISTS health_error TEXT
  `;
  console.log("  + health_error");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_platform_assets_health
    ON platform_assets(health_status, health_checked_at)
  `;
  console.log("  + idx_platform_assets_health");

  console.log("Done.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
