/**
 * Migration 170: Add businesses.tagline column.
 *
 * Promotes the tagline to an owner-canonical first-class column. Per the
 * 2026-06-15 architectural decision:
 *   - businesses.tagline TEXT NULL — owner-canonical declaration; null
 *     until owner picks an exemplar or types one
 *   - brand_descriptor verbal.tagline JSONB — stays as the SUGGESTION
 *     ENGINE (LLM-generated exemplars a/b/c); never authoritative
 *
 * Backfills B2 specifically with "Build on." (the owner's analog tagline)
 * since the earlier fix landed in the descriptor JSONB. Other businesses
 * stay NULL — owner action required.
 *
 * Idempotent. Additive — column-add only.
 *
 * Run: node scripts/migrate-170-businesses-tagline.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query(`ALTER TABLE businesses ADD COLUMN IF NOT EXISTS tagline TEXT`);
    console.log("  ✓ businesses.tagline column added (or already present)");

    const r = await c.query(`
      UPDATE businesses
      SET tagline = 'Build on.'
      WHERE name ILIKE '%b2 construction%' AND (tagline IS NULL OR tagline = '')
      RETURNING id, name
    `);
    for (const row of r.rows) {
      console.log(`  ✓ Backfilled ${row.name} (${row.id}) tagline → "Build on."`);
    }
    if (r.rowCount === 0) {
      console.log("  · B2 already had a tagline; no backfill needed.");
    }
  } catch (e) {
    console.error("migration failed:", e);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
