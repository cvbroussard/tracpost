/**
 * Migrate: users.billing_account_id → NULLABLE
 *
 * A billing account is a *customer* attribute, not a universal one. Platform
 * and operator staff users are accountless — their identity is the v3
 * membership, not an account. This drops the NOT NULL so such staff users
 * (e.g. the super admin) can exist without hanging off a customer account.
 *
 * Relax-only and safe in isolation:
 *   - keeps the FK and ON DELETE CASCADE; only drops NOT NULL
 *   - rewrites nothing; changes no existing row (every current user keeps its account)
 *   - a NULL only appears once create-user mints a staff user (downstream), so this
 *     is inert against the live app + the auth dual-read window until then
 *
 * Invariant going forward (app-enforced, not a DB CHECK since it's cross-table):
 *   business/agency users REQUIRE an account; platform/operator users are
 *   account-null and carry a global membership.
 *
 * Idempotent: re-running is a no-op once the column is already nullable.
 *
 * Run:  node scripts/migrate-users-account-nullable.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* Node ≥22 native WS */ }

async function isNullable(client, table, col) {
  const { rows } = await client.query(
    `SELECT is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
    [table, col],
  );
  if (rows.length === 0) return null; // column missing
  return rows[0].is_nullable === "YES";
}

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    console.log("Preconditions:");
    const before = await isNullable(client, "users", "billing_account_id");
    if (before === null) {
      console.error("  ✗ users.billing_account_id not found — has migrate-137 run? Aborting (no changes).");
      process.exitCode = 1;
      return;
    }
    console.log(`  · users.billing_account_id is_nullable = ${before ? "YES" : "NO"}`);
    if (before) {
      console.log("\nAlready nullable — nothing to do.");
      return;
    }

    await client.query("BEGIN");
    await client.query(`ALTER TABLE users ALTER COLUMN billing_account_id DROP NOT NULL`);
    await client.query("COMMIT");

    const after = await isNullable(client, "users", "billing_account_id");
    console.log(`  ${after ? "✓" : "⚠"} users.billing_account_id is_nullable = ${after ? "YES" : "NO"}`);
    console.log("\nMigration complete — staff (platform/operator) users may now be accountless.");
    console.log("FK + ON DELETE CASCADE unchanged; existing rows untouched.");
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
