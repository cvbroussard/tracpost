/**
 * Migrate (DESTRUCTIVE, IRREVERSIBLE): DROP users.business_id_legacy
 *
 * Track B / drop step. `business_id_legacy` is the renamed-dead legacy
 * `users.business_id` (commit db8519a). Commit 84c3bd0 removed every
 * reader/writer; site-scope lives on the capture/reviewer business
 * membership's scope_id now. The tripwire stayed silent on live traffic.
 * This permanently drops it.
 *
 * IRREVERSIBLE — the column and its data are gone. Run only after the tripwire
 * has baked clean (no `column "business_id" does not exist` in logs).
 *
 * Idempotent: no-op if already dropped.
 *
 * Run:  node scripts/migrate-users-business-id-drop.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* Node ≥22 native WS */ }

async function colExists(client, table, col) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, col],
  );
  return rows.length > 0;
}

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const hasLegacy = await colExists(client, "users", "business_id_legacy");
    const hasCol = await colExists(client, "users", "business_id");
    console.log("Preconditions:");
    console.log(`  · users.business_id_legacy exists = ${hasLegacy}`);
    console.log(`  · users.business_id        exists = ${hasCol}`);

    if (hasCol) {
      console.error("\n  ✗ users.business_id still exists — B tripwire rename has not run. Aborting (no changes).");
      process.exitCode = 1;
      return;
    }
    if (!hasLegacy) {
      console.log("\nAlready dropped — nothing to do.");
      return;
    }

    await client.query("BEGIN");
    await client.query(`ALTER TABLE users DROP COLUMN business_id_legacy`);
    await client.query("COMMIT");

    const after = await colExists(client, "users", "business_id_legacy");
    console.log(`\n  ${after ? "⚠" : "✓"} users.business_id_legacy exists = ${after}`);
    console.log("\nDropped. users.business_id is fully retired — site-scope lives on the business membership scope_id.");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\nMigration FAILED — rolled back. No changes applied.");
    console.error("ERR:", e.message);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
