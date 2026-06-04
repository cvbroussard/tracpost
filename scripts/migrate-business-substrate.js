/**
 * Migration: business_substrate table — the SUBSTRATE LAYER's first storage primitive.
 *
 * Per [[substrate-libraries-layer]] (LOCKED 2026-06-02): system-derived intelligence
 * persists in a separate store from owner-authoritative declared values. v1 lands
 * the minimal table; the full architecture (kind registry / dispatcher / invalidation
 * system) is deferred.
 *
 * First consumer: [[brand-identity-research-architecture]] Phase 2 — the aesthetic
 * observation call writes `kind='brand_identity_observation'` rows. env_look +
 * subject_style example generators (when built) read from here. Phase 3 owner-
 * approved canonical record lands in brand_descriptor[aesthetic].declared (separate
 * lifecycle, separate store — the lock).
 *
 * Idempotent. Additive. No data dependencies. Run: node scripts/migrate-business-substrate.js
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
      CREATE TABLE IF NOT EXISTS business_substrate (
        id                  UUID PRIMARY KEY,
        business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        kind                TEXT NOT NULL,
        payload             JSONB NOT NULL,
        generation_metadata JSONB,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_business_substrate_business ON business_substrate(business_id)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_business_substrate_kind ON business_substrate(kind)`);
    // One row per (business, kind) — regeneration replaces in place. Future kinds
    // that need multi-row semantics (e.g. derived inventories) can drop this
    // constraint per-kind by adding a discriminator column when needed.
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_business_substrate_kind ON business_substrate(business_id, kind)`);
    console.log("  ✓ business_substrate (+ idx_business_substrate_business, idx_business_substrate_kind, uq_business_substrate_kind)");

    await c.query("COMMIT");

    const [{ table_name }] = (await c.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema() AND table_name = 'business_substrate' LIMIT 1
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
