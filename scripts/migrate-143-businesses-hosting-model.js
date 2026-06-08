/**
 * Migration 143: businesses.hosting_model column.
 *
 * Adds an explicit hosting-model declaration to brands. Per
 * [[tracpost-b2-is-tracpost-hosted]] TracPost-hosted is the shipped
 * product; some brands may also use TracPost only as a content
 * publishing engine to their externally-hosted site. The provisioning
 * pipeline forks at step 15 based on this column.
 *
 * Values:
 *   'tracpost_hosted'    — TracPost serves the website (custom domain
 *                          pointed at our edge, or {tenant}.tracpost.com).
 *                          Step "Website (TracPost-hosted) Provisioning"
 *                          surfaces.
 *   'external_hosted'    — Tenant hosts elsewhere; TracPost only
 *                          observes via PPA + publishes content. Step
 *                          "Website (externally hosted)" surfaces.
 *   NULL                 — Not yet declared. Both website tasks remain
 *                          blocked / pending until subscriber chooses.
 *
 * Backfill heuristic:
 *   1. B2 → 'tracpost_hosted' (per memory; canonical test case).
 *   2. Anywhere blog_settings.custom_domain IS NOT NULL → 'tracpost_hosted'
 *      (DNS already pointed at us = currently being served by us).
 *   3. Everything else → NULL (subscriber must declare).
 *
 * Run: node scripts/migrate-143-businesses-hosting-model.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

const B2_BUSINESS_ID = "3db37450-72a3-4512-8094-9026c99a1191";

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    console.log("→ ADD COLUMN hosting_model");
    await c.query(`
      ALTER TABLE businesses
      ADD COLUMN IF NOT EXISTS hosting_model TEXT
    `);

    console.log("→ ADD CHECK hosting_model IN (tracpost_hosted, external_hosted)");
    // Drop first if pre-existing (idempotent re-runs)
    await c.query(`
      ALTER TABLE businesses
      DROP CONSTRAINT IF EXISTS businesses_hosting_model_check
    `);
    await c.query(`
      ALTER TABLE businesses
      ADD CONSTRAINT businesses_hosting_model_check
      CHECK (hosting_model IS NULL OR hosting_model IN ('tracpost_hosted', 'external_hosted'))
    `);

    console.log("→ backfill B2 → tracpost_hosted");
    const r1 = await c.query(`
      UPDATE businesses
      SET hosting_model = 'tracpost_hosted'
      WHERE id = $1 AND hosting_model IS NULL
    `, [B2_BUSINESS_ID]);
    console.log(`   ${r1.rowCount} row(s) updated`);

    console.log("→ backfill brands with custom_domain → tracpost_hosted");
    const r2 = await c.query(`
      UPDATE businesses b
      SET hosting_model = 'tracpost_hosted'
      WHERE b.hosting_model IS NULL
        AND EXISTS (
          SELECT 1 FROM blog_settings bs
          WHERE bs.business_id = b.id AND bs.custom_domain IS NOT NULL
        )
    `);
    console.log(`   ${r2.rowCount} row(s) updated`);

    await c.query("COMMIT");
    console.log("\n✅ Migration 143 complete");

    const verify = await c.query(`
      SELECT hosting_model, COUNT(*)::int AS n FROM businesses
      GROUP BY hosting_model ORDER BY hosting_model NULLS LAST
    `);
    console.log("\nbusinesses by hosting_model:");
    for (const r of verify.rows) {
      console.log(`  ${(r.hosting_model ?? "<null>").padEnd(20)} ${r.n}`);
    }
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("\n❌ Migration failed, rolled back:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
