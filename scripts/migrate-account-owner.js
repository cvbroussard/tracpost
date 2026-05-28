/**
 * Phase 0 (retire users.role) — add accounts.owner_user_id
 *
 * New source of truth for account ownership, replacing the `users.role='owner'`
 * convention. Ownership is an account-level fact, not a per-user role.
 *
 * Additive + idempotent:
 *   - ADD COLUMN accounts.owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL
 *   - backfill from the role='owner' user per account (earliest if >1); NULLs only
 *   - NO reads change yet — safe in isolation, inert until Phase 1 rewires readers
 *
 * Also reports data quality up front: accounts with 0 owners (can't backfill) or
 * >1 owners (ambiguous — backfill takes the earliest), so we know what we're
 * dealing with before rewiring the ~30 owner-joins.
 *
 * Run:  node scripts/migrate-account-owner.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* Node ≥22 native WS */ }

async function columnExists(client, table, col) {
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
    const has = await columnExists(client, "accounts", "owner_user_id");
    console.log(`Preconditions:\n  · accounts.owner_user_id exists = ${has ? "YES" : "NO"}`);

    // Data-quality pre-check (read-only)
    const dq = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM accounts) AS accounts,
        (SELECT count(*)::int FROM (
           SELECT a.id FROM accounts a
           JOIN users u ON u.billing_account_id = a.id AND u.role = 'owner'
           GROUP BY a.id HAVING count(*) > 1) x) AS multi_owner,
        (SELECT count(*)::int FROM accounts a
           WHERE NOT EXISTS (
             SELECT 1 FROM users u WHERE u.billing_account_id = a.id AND u.role = 'owner'
           )) AS no_owner
    `)).rows[0];
    console.log(`  · accounts=${dq.accounts}  no-owner=${dq.no_owner}  multi-owner=${dq.multi_owner}`);

    await client.query("BEGIN");

    if (!has) {
      await client.query(
        `ALTER TABLE accounts ADD COLUMN owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL`,
      );
      console.log("  ✓ added accounts.owner_user_id");
    } else {
      console.log("  · column already present — skipping ADD");
    }

    const res = await client.query(`
      UPDATE accounts a
      SET owner_user_id = (
        SELECT u.id FROM users u
        WHERE u.billing_account_id = a.id AND u.role = 'owner'
        ORDER BY u.created_at ASC
        LIMIT 1
      )
      WHERE a.owner_user_id IS NULL
    `);
    console.log(`  ✓ backfilled owner_user_id on ${res.rowCount} account(s)`);

    await client.query("COMMIT");

    const after = (await client.query(`
      SELECT
        (SELECT count(*)::int FROM accounts WHERE owner_user_id IS NOT NULL) AS with_owner,
        (SELECT count(*)::int FROM accounts WHERE owner_user_id IS NULL) AS without_owner
    `)).rows[0];
    console.log(`  result: with_owner=${after.with_owner}  without_owner=${after.without_owner}`);
    console.log("\nPhase 0 complete — accounts.owner_user_id in place; no readers changed yet.");
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
