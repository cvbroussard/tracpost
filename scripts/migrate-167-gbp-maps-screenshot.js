/**
 * Migration 167: Add businesses.gbp_maps_screenshot + gbp_maps_screenshot_at.
 *
 * Captures of the live Google Maps GBP profile panel — the public-presence
 * truth source for what a prospect actually sees when they search the brand
 * on Maps. Replaces the previous practice of feeding TracPost-side
 * gbp_cover_asset_id / gbp_logo_asset_id (which are nominations awaiting a
 * push, not public artifacts) to PPA as "GBP cover/logo."
 *
 * Idempotent. Additive — column-add only. Safe to re-run.
 *
 * Run: node scripts/migrate-167-gbp-maps-screenshot.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query(`
      ALTER TABLE businesses
      ADD COLUMN IF NOT EXISTS gbp_maps_screenshot TEXT,
      ADD COLUMN IF NOT EXISTS gbp_maps_screenshot_at TIMESTAMPTZ
    `);
    console.log("  ✓ businesses.gbp_maps_screenshot + gbp_maps_screenshot_at added (or already present)");
  } catch (e) {
    console.error("migration failed:", e);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
