/**
 * Migrate (ADDITIVE, safe — new tables only, no data/behavior change): the v3
 * brand-identity schema. Task #41.
 *
 *   1. brand_identity        — the brand container (1:N-ready, hangs off a business)
 *   2. brand_descriptor      — one row per descriptor {declared, extracted, provenance}
 *   3. brand_descriptor_asset — M:N: assets backing a descriptor (→ media_assets)
 *
 * Design: tracpost-brand-identity-schema memory. Identity is PERSISTENT across all
 * campaigns; a creative brief is a per-campaign frozen resolution of it. The
 * descriptor catalog (src/lib/brand-identity/catalog.ts) is the contract the
 * pipeline reads (generation) and grades against (brand-fit).
 *
 * Idempotent (CREATE ... IF NOT EXISTS) + transactional. No legacy migration —
 * the 5 betas are regenerated from the ground up (see memory).
 * Run:  node scripts/migrate-brand-identity-schema.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1. brand_identity — the brand container
    await c.query(`
      CREATE TABLE IF NOT EXISTS brand_identity (
        id          UUID PRIMARY KEY,
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        is_primary  BOOLEAN NOT NULL DEFAULT false,
        name        TEXT,
        slug        TEXT,
        source      TEXT,                       -- 'manual' | 'extracted' | ...
        version     INTEGER NOT NULL DEFAULT 1,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_brand_identity_business ON brand_identity(business_id)`);
    // at most one primary brand per business
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_identity_primary ON brand_identity(business_id) WHERE is_primary`);
    console.log("  ✓ brand_identity (+ idx_brand_identity_business, uq_brand_identity_primary)");

    // 2. brand_descriptor — one row per descriptor
    await c.query(`
      CREATE TABLE IF NOT EXISTS brand_descriptor (
        id                    UUID PRIMARY KEY,
        brand_identity_id     UUID NOT NULL REFERENCES brand_identity(id) ON DELETE CASCADE,
        domain                TEXT NOT NULL,
        key                   TEXT NOT NULL,
        label                 TEXT,
        declared              TEXT,             -- raw human input ("may or may never surface")
        extracted             JSONB,            -- model's compilation of declared + assets (what surfaces)
        extracted_inputs      JSONB,            -- provenance: declared + asset ids + enrichment facets + model
        extraction_model      TEXT,
        extracted_at          TIMESTAMPTZ,
        extraction_confidence NUMERIC,          -- 0..1
        status                TEXT,             -- NULL | declared_only | extracted | stale
        position              INTEGER NOT NULL DEFAULT 0,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT brand_descriptor_domain_check
          CHECK (domain IN ('verbal','strategic','visual','sonic')),
        CONSTRAINT brand_descriptor_status_check
          CHECK (status IS NULL OR status IN ('declared_only','extracted','stale')),
        CONSTRAINT brand_descriptor_confidence_check
          CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0 AND extraction_confidence <= 1))
      )
    `);
    // a descriptor is identified by (brand, domain, key)
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_brand_descriptor_key ON brand_descriptor(brand_identity_id, domain, key)`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_brand_descriptor_identity ON brand_descriptor(brand_identity_id)`);
    console.log("  ✓ brand_descriptor (+ uq_brand_descriptor_key, idx_brand_descriptor_identity)");

    // 3. brand_descriptor_asset — M:N descriptor ↔ media_assets
    await c.query(`
      CREATE TABLE IF NOT EXISTS brand_descriptor_asset (
        descriptor_id UUID NOT NULL REFERENCES brand_descriptor(id) ON DELETE CASCADE,
        asset_id      UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
        role          TEXT,                     -- 'reference' | 'logo' | 'palette_source' | 'vo_sample' ...
        position      INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (descriptor_id, asset_id)
      )
    `);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_brand_descriptor_asset_asset ON brand_descriptor_asset(asset_id)`);
    console.log("  ✓ brand_descriptor_asset (+ idx_brand_descriptor_asset_asset)");

    await c.query("COMMIT");

    // report
    const tbls = (await c.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('brand_identity','brand_descriptor','brand_descriptor_asset')
      ORDER BY table_name`)).rows.map((r) => r.table_name);
    console.log(`\n  tables present: ${tbls.join(", ")}`);
    console.log("\nDone (additive — new tables only). Next: seed via createBrandIdentity() (src/lib/brand-identity/store.ts).");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("\nFAILED — rolled back.", e.message);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
