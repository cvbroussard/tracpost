/**
 * Migration 156: Retire first_upload + search_console from branding pipeline.
 *
 * Per the 2026-06-12 three-milestone architecture: the branding pipeline
 * is canonically scoped to brand identity work. Both first_upload (media
 * asset ingestion) and search_console (GSC verification) are Helper /
 * Infrastructure concerns — payloads downstream consumers need, but not
 * brand identity inputs.
 *
 *   - first_upload's observability lives at /ops/media (Media Production
 *     milestone, technically — media ingestion crosses both)
 *   - search_console's observability lives at /ops/seo (Infrastructure
 *     milestone)
 *
 * Cleanup:
 *   1. Drop first_upload + search_console rows across all billing accounts.
 *      Neither has downstream deps in the current pipeline (verified
 *      during their individual audits 2026-06-11), so no re-pointing.
 *
 * Idempotent — safe to re-run.
 *
 * Run: node scripts/migrate-156-retire-first-upload-search-console.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // Safety check — surface any unexpected downstream deps before delete.
    const deps = await c.query(`
      SELECT task_key, billing_account_id, depends_on FROM provisioning_tasks
      WHERE depends_on && ARRAY['first_upload', 'search_console']::text[]
    `);
    if (deps.rowCount > 0) {
      console.log(`⚠ Found ${deps.rowCount} downstream deps — clearing them too:`);
      for (const r of deps.rows) {
        console.log(`  ${r.task_key} → ${JSON.stringify(r.depends_on)}`);
      }
      await c.query(`
        UPDATE provisioning_tasks
        SET depends_on = (
          SELECT ARRAY(
            SELECT d FROM unnest(depends_on) d
            WHERE d NOT IN ('first_upload', 'search_console')
          )
        )
        WHERE depends_on && ARRAY['first_upload', 'search_console']::text[]
      `);
    }

    // Drop both tasks.
    const dropped = await c.query(`
      DELETE FROM provisioning_tasks
      WHERE task_key IN ('first_upload', 'search_console')
      RETURNING task_key, billing_account_id
    `);
    const byKey = {};
    for (const r of dropped.rows) {
      byKey[r.task_key] = (byKey[r.task_key] || 0) + 1;
    }
    console.log(`\n✓ Dropped tasks:`);
    for (const k of Object.keys(byKey)) {
      console.log(`  ${k.padEnd(28)} from ${byKey[k]} billing accounts`);
    }

    await c.query("COMMIT");
    console.log("\n✅ first_upload + search_console retirement complete\n");

    // Verify
    const [first] = dropped.rows;
    if (first) {
      const verify = await c.query(`
        SELECT task_key, sort_order, depends_on FROM provisioning_tasks
        WHERE billing_account_id = $1
        ORDER BY sort_order
      `, [first.billing_account_id]);
      console.log("All tasks (account 1) after cleanup:");
      for (const r of verify.rows) {
        console.log(`  ${String(r.sort_order).padStart(2)}. ${r.task_key.padEnd(28)} depends_on=${JSON.stringify(r.depends_on)}`);
      }
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
