/**
 * Migrate (TRIPWIRE): users.business_id → users.business_id_legacy
 *
 * Track B / tripwire step. Code no longer reads or writes users.business_id
 * (commit 84c3bd0) — site-scope lives on the capture/reviewer business
 * membership's scope_id. This rename is the loud-failure safety net: any SQL
 * reference we missed now fails with `column "business_id" does not exist`
 * instead of silently mis-scoping a user.
 *
 * RUN ONLY after the 84c3bd0 deploy is LIVE — older deployed code still
 * SELECTs u.business_id (e.g. in /api/auth/login) and would 500 until the new
 * build lands. Reversible until the DROP: `RENAME business_id_legacy TO business_id`.
 *
 * Idempotent: no-op if already renamed.
 *
 * Run:  node scripts/migrate-users-business-id-rename.js
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
    const hasCol = await colExists(client, "users", "business_id");
    const hasLegacy = await colExists(client, "users", "business_id_legacy");
    console.log("Preconditions:");
    console.log(`  · users.business_id        exists = ${hasCol}`);
    console.log(`  · users.business_id_legacy exists = ${hasLegacy}`);

    if (!hasCol && hasLegacy) {
      console.log("\nAlready renamed — nothing to do.");
      return;
    }
    if (!hasCol && !hasLegacy) {
      console.error("\n  ✗ Neither column exists. Aborting (no changes).");
      process.exitCode = 1;
      return;
    }
    if (hasCol && hasLegacy) {
      console.error("\n  ✗ BOTH columns exist — ambiguous. Resolve manually. Aborting.");
      process.exitCode = 1;
      return;
    }

    await client.query("BEGIN");
    await client.query(`ALTER TABLE users RENAME COLUMN business_id TO business_id_legacy`);
    await client.query("COMMIT");

    const afterCol = await colExists(client, "users", "business_id");
    const afterLegacy = await colExists(client, "users", "business_id_legacy");
    console.log(`\n  ${!afterCol && afterLegacy ? "✓" : "⚠"} business_id → business_id_legacy (business_id exists=${afterCol}, legacy exists=${afterLegacy})`);
    console.log("\nTripwire armed. Watch for 'column \"business_id\" does not exist'.");
    console.log("Revert if needed: RENAME business_id_legacy TO business_id.");
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
