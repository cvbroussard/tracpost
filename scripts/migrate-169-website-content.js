/**
 * Migration 169: website_content + brand_catalog_snapshots tables.
 *
 * Phase 1 of the website generator overhaul. Per the locked input/output
 * contract:
 *
 * - brand_catalog_snapshots captures the FULL input state (catalog +
 *   business_info + gbp_profile) at generation time. Inline JSONB so the
 *   generator can pin to a snapshot for drift detection. One snapshot row
 *   per generation event.
 *
 * - website_content stores the generated page content as JSON envelopes per
 *   the locked schema. One row per (business_id, page_key, status).
 *   Lifecycle: draft → published → stale (catalog drifted) → archived.
 *   Each row references the snapshot it was generated from.
 *
 * Idempotent. Run: node scripts/migrate-169-website-content.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // brand_catalog_snapshots: pin the catalog + companion state at gen time
    await c.query(`
      CREATE TABLE IF NOT EXISTS brand_catalog_snapshots (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        catalog_version TEXT NOT NULL,
        input_payload JSONB NOT NULL
      )
    `);
    console.log("  ✓ brand_catalog_snapshots table");

    await c.query(`
      CREATE INDEX IF NOT EXISTS idx_brand_catalog_snapshots_business
        ON brand_catalog_snapshots (business_id, captured_at DESC)
    `);
    console.log("  ✓ idx_brand_catalog_snapshots_business");

    // website_content: generated page content storage
    await c.query(`
      CREATE TABLE IF NOT EXISTS website_content (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        page_key TEXT NOT NULL CHECK (page_key IN ('home', 'about', 'services', 'blog', 'projects', 'contact')),
        status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'stale', 'archived')),

        content JSONB NOT NULL,

        generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        generated_from_catalog_version TEXT NOT NULL,
        generated_from_catalog_snapshot_id UUID NOT NULL REFERENCES brand_catalog_snapshots(id),
        generator_model TEXT NOT NULL,
        generator_prompt_version TEXT NOT NULL,

        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("  ✓ website_content table");

    // One published row per (business, page).
    await c.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_published_page_per_business
        ON website_content (business_id, page_key)
        WHERE status = 'published'
    `);
    console.log("  ✓ uniq_published_page_per_business");

    await c.query(`
      CREATE INDEX IF NOT EXISTS idx_website_content_business_page
        ON website_content (business_id, page_key, status, generated_at DESC)
    `);
    console.log("  ✓ idx_website_content_business_page");

    await c.query("COMMIT");
    console.log("\n✅ Migration 169 complete");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("\n❌ Migration failed, rolled back:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
