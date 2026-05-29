/**
 * Migrate (DESTRUCTIVE, IRREVERSIBLE): DROP users.role_legacy
 *
 * Phase 4 / step A4. `role_legacy` is the renamed-dead legacy `users.role`
 * (A3, commit 9a8ee83). A1+A2 (commit 84bd58a) removed every reader/writer;
 * the A3 tripwire stayed silent on live traffic. This permanently drops it.
 *
 * IRREVERSIBLE — the column and its data are gone. Run only after the tripwire
 * has baked clean (no `column "role" does not exist` in logs).
 *
 * Idempotent: no-op if already dropped.
 *
 * Run:  node scripts/migrate-users-role-drop.js
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
    const hasLegacy = await colExists(client, "users", "role_legacy");
    const hasRole = await colExists(client, "users", "role");
    console.log("Preconditions:");
    console.log(`  · users.role_legacy exists = ${hasLegacy}`);
    console.log(`  · users.role        exists = ${hasRole}`);

    if (hasRole) {
      console.error("\n  ✗ users.role still exists — A3 rename has not run. Aborting (no changes).");
      process.exitCode = 1;
      return;
    }
    if (!hasLegacy) {
      console.log("\nAlready dropped — nothing to do.");
      return;
    }

    await client.query("BEGIN");
    await client.query(`ALTER TABLE users DROP COLUMN role_legacy`);
    await client.query("COMMIT");

    const after = await colExists(client, "users", "role_legacy");
    console.log(`\n  ${after ? "⚠" : "✓"} users.role_legacy exists = ${after}`);
    console.log("\nDropped. users.role is fully retired — memberships + accounts.owner_user_id are the sole authority.");
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
