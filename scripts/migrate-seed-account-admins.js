/**
 * Migrate (data seed): mint the account-scope ADMIN membership (= owner) for
 * each real account, derived from the accurate accounts.owner_user_id. Task #39.
 *
 * Establishes the new owner model (owner = account-scope admin membership) for
 * existing accounts so the isOwner rewire (#32) has something to read.
 *
 * Scope: accounts whose owner is an ACTIVE user — this seeds the real accounts
 * and skips the junk ones (their owner users were deactivated). Guarded by
 * NOT EXISTS (idempotent) and won't violate uq_account_admin (≤1 admin/account).
 *
 * MUST run only after derivePrincipal reads accounts.type (#31, commit 5a36234,
 * deployed) — otherwise these new account-scope rows make direct owners derive
 * as 'agency' principals.
 *
 * Run:  node scripts/migrate-seed-account-admins.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const res = await c.query(`
      INSERT INTO memberships (user_id, scope_type, scope_id, role, capability)
      SELECT a.owner_user_id, 'account', a.id, 'admin', NULL
      FROM accounts a
      JOIN users u ON u.id = a.owner_user_id AND u.is_active = true
      WHERE a.owner_user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM memberships m
          WHERE m.scope_type = 'account' AND m.scope_id = a.id AND m.role = 'admin'
        )
    `);
    await c.query("COMMIT");
    console.log(`  ✓ seeded ${res.rowCount} account-scope admin membership(s) (active-owner accounts)`);

    const dist = await c.query(`
      SELECT
        (SELECT count(*)::int FROM accounts) AS accounts_total,
        (SELECT count(DISTINCT scope_id)::int FROM memberships WHERE scope_type='account' AND role='admin') AS accounts_with_admin,
        (SELECT count(*)::int FROM accounts a JOIN users u ON u.id=a.owner_user_id AND u.is_active=true) AS active_owner_accounts
    `);
    console.log("  state:", JSON.stringify(dist.rows[0]));
    console.log("\nDone. Real accounts now have an account-scope admin (owner) membership; junk (deactivated-owner) accounts skipped.");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("\nFAILED — rolled back.", e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
