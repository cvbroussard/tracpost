/**
 * Migrate (TRIPWIRE): users.role → users.role_legacy
 *
 * Phase 4 / step A3 of the users.role retirement. Code no longer reads or
 * writes users.role (commit 84bd58a, A1+A2) — memberships + accounts.owner_user_id
 * are the sole authority. This rename is a safety net: any SQL reference we
 * missed will now fail LOUDLY ("column \"role\" does not exist") instead of
 * silently reading a stale value. Grep says zero readers remain; this proves it
 * on live traffic before the destructive DROP (A4).
 *
 * Run this ONLY after the A1+A2 deploy is live and auth is verified across
 * surfaces (owner / member / capture / super-admin / mobile).
 *
 * Reversible until A4: `ALTER TABLE users RENAME COLUMN role_legacy TO role`.
 *
 * Idempotent: no-op if already renamed.
 *
 * Run:  node scripts/migrate-users-role-rename.js
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
    console.log("Preconditions:");
    const hasRole = await colExists(client, "users", "role");
    const hasLegacy = await colExists(client, "users", "role_legacy");
    console.log(`  · users.role         exists = ${hasRole}`);
    console.log(`  · users.role_legacy  exists = ${hasLegacy}`);

    if (!hasRole && hasLegacy) {
      console.log("\nAlready renamed — nothing to do.");
      return;
    }
    if (!hasRole && !hasLegacy) {
      console.error("\n  ✗ Neither users.role nor users.role_legacy exists. Aborting (no changes).");
      process.exitCode = 1;
      return;
    }
    if (hasRole && hasLegacy) {
      console.error("\n  ✗ BOTH users.role and users.role_legacy exist — ambiguous. Resolve manually. Aborting.");
      process.exitCode = 1;
      return;
    }

    await client.query("BEGIN");
    await client.query(`ALTER TABLE users RENAME COLUMN role TO role_legacy`);
    await client.query("COMMIT");

    const afterRole = await colExists(client, "users", "role");
    const afterLegacy = await colExists(client, "users", "role_legacy");
    console.log(`\n  ${!afterRole && afterLegacy ? "✓" : "⚠"} users.role → role_legacy (role exists=${afterRole}, role_legacy exists=${afterLegacy})`);
    console.log("\nTripwire armed. Watch logs/Sentry for 'column \"role\" does not exist'.");
    console.log("If clean for a day or two, run the DROP (A4). To revert: RENAME role_legacy TO role.");
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
