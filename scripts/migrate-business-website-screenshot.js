/**
 * Migration: businesses.business_website_screenshot column — a canonical R2 URL
 * for the brand's homepage screenshot, matching the existing `business_logo` /
 * `business_favicon` columns. Used by [[brand-identity-research-architecture]]
 * Phase 2 observation as the primary visual reference for the brand.
 *
 * The eventual screenshot service (headless Chrome → R2) writes to the same
 * column; v1 verification populates it manually via R2 upload.
 *
 * Idempotent. Additive (column-add, no data). Run: node scripts/migrate-business-website-screenshot.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS business_website_screenshot TEXT`);
    console.log("  ✓ businesses.business_website_screenshot added (or already present)");
  } catch (err) {
    console.error("migration failed:", err);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
