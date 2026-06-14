/**
 * Migration 166: Add businesses.business_website_screenshot_at column.
 *
 * Companion timestamp to businesses.business_website_screenshot — tracks
 * when the most recent capture was written so the operator UI can display
 * "Last captured: …" and PPA can decide whether to JIT-capture a fresh
 * one based on staleness.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-166-business-website-screenshot-at.js
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
      ADD COLUMN IF NOT EXISTS business_website_screenshot_at TIMESTAMPTZ
    `);
    console.log("  ✓ businesses.business_website_screenshot_at added (or already present)");

    // Backfill rows where a screenshot URL exists but the timestamp is null
    // — we don't know the real capture time, but a recent fixed time gives
    // the UI a sensible "last captured" rather than null.
    const back = await c.query(`
      UPDATE businesses
      SET business_website_screenshot_at = NOW()
      WHERE business_website_screenshot IS NOT NULL
        AND business_website_screenshot_at IS NULL
      RETURNING id
    `);
    console.log(`  ✓ Backfilled ${back.rowCount} row(s) with NOW() timestamp`);
  } catch (e) {
    console.error("migration failed:", e);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
