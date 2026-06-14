/**
 * Migration 168: Add businesses.gbp_photos_grid + gbp_photos_grid_at.
 *
 * Composite grid image of GBP photos (up to 10), pulled from gbp_photo_sync
 * (owner-published, synced from Google's GBP API). Replaces the per-photo
 * payload loop in PPA — the LLM sees one composite rather than 4 individual
 * base64 images. Tighter payload, richer cross-photo visual observation
 * (variety/coherence patterns), no Maps-rendering complications.
 *
 * Companion: businesses.gbp_maps_screenshot from migration 167 stays in
 * place as deferred storage — the Maps panel capture work is being rolled
 * back in favor of the grid approach, but dropping the columns now adds
 * needless churn. Leaving them harmless and unused.
 *
 * Idempotent. Additive — column-add only.
 *
 * Run: node scripts/migrate-168-gbp-photos-grid.js
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
      ADD COLUMN IF NOT EXISTS gbp_photos_grid TEXT,
      ADD COLUMN IF NOT EXISTS gbp_photos_grid_at TIMESTAMPTZ
    `);
    console.log("  ✓ businesses.gbp_photos_grid + gbp_photos_grid_at added (or already present)");
  } catch (e) {
    console.error("migration failed:", e);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
