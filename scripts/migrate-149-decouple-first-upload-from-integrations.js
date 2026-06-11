/**
 * Migration 149: Decouple first_upload from integrations.
 *
 * Per the provisioning pipeline scope doctrine
 * ([[provisioning-scope]]) LOCKED 2026-06-11:
 *   - Raw material acquisition (first_upload) is a PARALLEL pipeline
 *     to brand identity / channel setup, NOT inline-sequenced.
 *   - The dependency first_upload.depends_on = ['integrations'] was a
 *     false sequence — implies channel setup blocks photo upload.
 *     Mechanically it doesn't. A tenant can upload photos before
 *     committing to social OAuth flows.
 *
 * This migration: removes 'integrations' from first_upload.depends_on,
 * leaving the task with empty dependencies (it can start at any time).
 *
 * Downstream chain preserved: first_content STILL depends on both
 * first_upload AND brand_identity_complete — that's the orchestrator
 * convergence point, which the doctrine explicitly supports (the
 * orchestrator needs BOTH machine control AND raw material).
 *
 * The larger re-classification (moving first_upload out of the
 * provisioning_tasks linear ordering entirely into a Raw Material
 * Pipeline) is deferred per the doctrine's "deferred work" section —
 * scoped to land after the brand identity audit (steps 1-12) is
 * complete.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-149-decouple-first-upload-from-integrations.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    const result = await c.query(`
      UPDATE provisioning_tasks
      SET depends_on = ARRAY(
        SELECT unnest(depends_on)
        EXCEPT
        SELECT unnest(ARRAY['integrations']::text[])
      )
      WHERE task_key = 'first_upload'
        AND 'integrations' = ANY(depends_on)
      RETURNING billing_account_id, depends_on
    `);

    await c.query("COMMIT");

    console.log(`✅ Decoupled first_upload from integrations on ${result.rowCount} accounts\n`);
    for (const r of result.rows) {
      console.log(`  ${r.billing_account_id} → depends_on=${JSON.stringify(r.depends_on)}`);
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
