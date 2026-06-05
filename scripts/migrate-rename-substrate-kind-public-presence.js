/**
 * Migration: rename substrate kind 'brand_identity_observation' →
 * 'public_presence_observation'.
 *
 * Background: the Phase 2 observation pipeline was renamed from generic
 * "brand identity observation" to the more precise "public presence analysis"
 * — what TracPost found when it reached into the wild for a brand (website,
 * GBP, public surfaces). Sibling to the CMA at the same temporal/source-class
 * tier per [[observation-driven-readiness-audit]]. The kind name is updated
 * on existing rows + on the thin pointers in brand_descriptor.extracted that
 * reference the substrate kind.
 *
 * Idempotent. Transactional. Updates 0-N rows depending on how many brands
 * have run the observation pipeline so far.
 *
 * Run: node scripts/migrate-rename-substrate-kind-public-presence.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1. Rename business_substrate rows.
    const substrateUpdate = await c.query(`
      UPDATE business_substrate
      SET kind = 'public_presence_observation', updated_at = now()
      WHERE kind = 'brand_identity_observation'
      RETURNING id, business_id
    `);
    console.log(`  ✓ business_substrate: renamed ${substrateUpdate.rowCount} row(s)`);
    for (const r of substrateUpdate.rows) {
      console.log(`      ${r.id} (business ${r.business_id})`);
    }

    // 2. Update the thin pointer in brand_descriptor.extracted.value.substrate_kind
    //    for any aesthetic descriptor referencing the old kind.
    const descriptorUpdate = await c.query(`
      UPDATE brand_descriptor
      SET extracted = jsonb_set(
            extracted,
            '{value,substrate_kind}',
            '"public_presence_observation"'::jsonb
          ),
          updated_at = now()
      WHERE domain = 'visual'
        AND key = 'aesthetic'
        AND extracted IS NOT NULL
        AND extracted->'value'->>'substrate_kind' = 'brand_identity_observation'
      RETURNING id, brand_identity_id
    `);
    console.log(`  ✓ brand_descriptor[visual.aesthetic] pointers: renamed ${descriptorUpdate.rowCount} row(s)`);
    for (const r of descriptorUpdate.rows) {
      console.log(`      ${r.id} (brand_identity ${r.brand_identity_id})`);
    }

    await c.query("COMMIT");
    console.log("\n  rename migration complete.");
  } catch (err) {
    await c.query("ROLLBACK");
    console.error("migration failed:", err);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
