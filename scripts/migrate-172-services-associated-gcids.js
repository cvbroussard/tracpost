/**
 * Migration 172: Add services.associated_gcids text[] column.
 *
 * Per [[stable-service-identity]] doctrine: each service has BOTH a
 * single canonical primary_gcid (N:1 anchor for surfaces needing one
 * category) AND associated_gcids[] (the cluster's full category set
 * for surfaces benefiting from breadth: GBP services push, ad
 * sitelinks, related-services matching).
 *
 * This is NOT a return to the over-binding M:N model — primary_gcid
 * remains the canonical N:1 anchor; associated_gcids is the cluster's
 * CURATED category set (categories that passed the majority-floor OR
 * top-3 threshold during clustering). Typically 2-4 entries.
 *
 * GIN index supports the "find services where gcid X is in
 * associated_gcids" query pattern used by per-category landing-page
 * filters and related-services queries.
 *
 * Idempotent. Additive. Existing rows get empty array; will be
 * populated on next pipeline run by the updated junction binder.
 *
 * Run: node scripts/migrate-172-services-associated-gcids.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query(`
      ALTER TABLE services
      ADD COLUMN IF NOT EXISTS associated_gcids TEXT[] NOT NULL DEFAULT '{}'
    `);
    console.log("  ✓ services.associated_gcids column added (or already present)");

    await c.query(`
      CREATE INDEX IF NOT EXISTS idx_services_associated_gcids
      ON services USING GIN (associated_gcids)
    `);
    console.log("  ✓ idx_services_associated_gcids (GIN) created (or present)");

    // Backfill: for services that already have a primary_gcid, seed
    // associated_gcids = [primary_gcid] so the array is non-empty even
    // before the next pipeline run populates it from the cluster.
    const r = await c.query(`
      UPDATE services
      SET associated_gcids = ARRAY[primary_gcid]
      WHERE primary_gcid IS NOT NULL
        AND (associated_gcids IS NULL OR cardinality(associated_gcids) = 0)
      RETURNING id, name
    `);
    console.log(`  ✓ Backfilled ${r.rowCount} services with primary-only associated_gcids`);

    const [stats] = (await c.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE cardinality(associated_gcids) > 0)::int AS with_associated,
        COUNT(*) FILTER (WHERE cardinality(associated_gcids) > 1)::int AS multi_anchor
      FROM services
    `)).rows;
    console.log(`\nFinal state:`);
    console.log(`  total services:            ${stats.total}`);
    console.log(`  with associated_gcids:     ${stats.with_associated}`);
    console.log(`  with multi-category set:   ${stats.multi_anchor}`);
    console.log(`\n  (multi-category count is 0 until next pipeline run populates the cluster set)`);
  } catch (e) {
    console.error("migration failed:", e);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
