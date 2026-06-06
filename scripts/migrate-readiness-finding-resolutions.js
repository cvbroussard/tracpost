/**
 * Migration: readiness_finding_resolutions — per-finding resolution status +
 * optional owner response text. Tier 4 v1 of the Phase 3 review surface.
 *
 * Resolutions are tied to a specific (business_id, finding_id) pair. Finding
 * ids are generated fresh per consolidation run, so regeneration of the
 * findings substrate orphans existing resolutions. v1 accepts this; surface
 * a warning at regenerate time. v2 introduces signature-based preservation.
 *
 * Idempotent. Additive. Run: node scripts/migrate-readiness-finding-resolutions.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    await c.query(`
      CREATE TABLE IF NOT EXISTS readiness_finding_resolutions (
        id                     UUID PRIMARY KEY,
        business_id            UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        findings_substrate_id  UUID NOT NULL,
        finding_id             UUID NOT NULL,
        status                 TEXT NOT NULL,
        response               TEXT,
        resolved_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT readiness_finding_resolutions_status_check
          CHECK (status IN ('resolved','waived','deferred'))
      )
    `);
    // One resolution per (business, finding). Re-resolving the same finding
    // updates the existing row in place.
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_readiness_finding_resolution
                   ON readiness_finding_resolutions(business_id, finding_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_readiness_finding_resolutions_substrate
                   ON readiness_finding_resolutions(findings_substrate_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_readiness_finding_resolutions_business
                   ON readiness_finding_resolutions(business_id)`);
    console.log("  ✓ readiness_finding_resolutions (+ 3 indexes)");

    await c.query("COMMIT");

    const [{ table_name }] = (await c.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'readiness_finding_resolutions' LIMIT 1
    `)).rows;
    console.log(`\n  table present: ${table_name}`);
  } catch (err) {
    await c.query("ROLLBACK");
    console.error("migration failed:", err);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
