/**
 * Migration 171: Collapse services↔categories from M:N to N:1.
 *
 * Per [[services-pipeline-doctrine]] (third-pass refinement 2026-06-16):
 * each service points to ONE canonical GBP category, not many. Cleaner
 * Google ranking signal, simpler schema, forces sharper curation. The
 * downstream consumers I enumerated (schema.org serviceType, GBP
 * services field push, sitelinks, internal linking, attribution) all
 * use a single primary category per service — M:N was over-engineered.
 *
 * Changes:
 *   1. Add services.primary_gcid TEXT — FK to gbp_categories(gcid).
 *      NULL until the binder writes the canonical anchor.
 *   2. Backfill primary_gcid from existing service_gbp_categories rows
 *      where is_primary = true (picks the M:N row that was already
 *      marked as the primary anchor).
 *   3. Leave service_gbp_categories table in place for now — drop in a
 *      future migration once downstream consumers migrate to read
 *      services.primary_gcid directly. Stops being written to going
 *      forward; reads remain valid until the deprecation cycle.
 *
 * Idempotent. Additive on services; non-destructive on the junction.
 *
 * Run: node scripts/migrate-171-services-primary-gcid.js
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
      ADD COLUMN IF NOT EXISTS primary_gcid TEXT
        REFERENCES gbp_categories(gcid) ON DELETE SET NULL
    `);
    console.log("  ✓ services.primary_gcid column added (or already present)");

    // Backfill primary_gcid from service_gbp_categories where is_primary = true.
    // Some services may have multiple is_primary=true rows (legacy bug
    // surface); take the first by stable ordering on (service_id, gcid).
    const r = await c.query(`
      WITH primaries AS (
        SELECT DISTINCT ON (service_id) service_id, gcid
        FROM service_gbp_categories
        WHERE is_primary = true
        ORDER BY service_id, gcid
      )
      UPDATE services s
      SET primary_gcid = p.gcid
      FROM primaries p
      WHERE s.id = p.service_id AND s.primary_gcid IS NULL
      RETURNING s.id, s.name, s.primary_gcid
    `);
    console.log(`  ✓ Backfilled ${r.rowCount} services with primary_gcid from junction`);
    for (const row of r.rows.slice(0, 5)) {
      console.log(`     · ${row.name} → ${row.primary_gcid}`);
    }
    if (r.rows.length > 5) console.log(`     ... +${r.rows.length - 5} more`);

    // Index for query patterns "SELECT services WHERE primary_gcid = ?"
    await c.query(`
      CREATE INDEX IF NOT EXISTS idx_services_primary_gcid
      ON services (primary_gcid)
      WHERE primary_gcid IS NOT NULL
    `);
    console.log("  ✓ idx_services_primary_gcid index created (or present)");

    const [stats] = (await c.query(`
      SELECT
        COUNT(*) FILTER (WHERE primary_gcid IS NOT NULL)::int AS bound,
        COUNT(*) FILTER (WHERE primary_gcid IS NULL)::int AS unbound,
        COUNT(*)::int AS total
      FROM services
    `)).rows;
    console.log(`\nFinal state: ${stats.bound}/${stats.total} services bound; ${stats.unbound} unbound`);
  } catch (e) {
    console.error("migration failed:", e);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
