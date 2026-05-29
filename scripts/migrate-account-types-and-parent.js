/**
 * Migrate (ADDITIVE, safe — schema only, no data/behavior change): account
 * hierarchy foundation. Task #28, schema portion ONLY.
 *
 *   1. accounts.type CHECK widened to (direct | agency | client)
 *   2. accounts.parent_account_id  uuid, self-FK accounts(id) ON DELETE RESTRICT,
 *      nullable (+ partial index for "an agency's clients" lookups)
 *   3. unique partial index: AT MOST one account-scope admin membership per
 *      account (enforces owner-singleton going forward; clients may have zero)
 *
 * The SEED step (one account-scope admin membership per existing account, from
 * owner_user_id) is DELIBERATELY NOT here — it must run only AFTER derivePrincipal
 * reads accounts.type (task #31). Seeding earlier would re-derive existing direct
 * owners as "agency" principals (account-scope membership ⟹ agency today).
 *
 * Idempotent + transactional.
 * Run:  node scripts/migrate-account-types-and-parent.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1. type CHECK → add 'client'. Find + drop the existing type check (whatever
    //    its name), then add the canonical 3-value one.
    const checks = await c.query(`
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'accounts'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%agency%'
    `);
    for (const r of checks.rows) {
      await c.query(`ALTER TABLE accounts DROP CONSTRAINT ${r.conname}`);
      console.log(`  · dropped check constraint ${r.conname}`);
    }
    await c.query(`ALTER TABLE accounts ADD CONSTRAINT accounts_type_check CHECK (type IN ('direct','agency','client'))`);
    console.log("  ✓ accounts.type CHECK = (direct | agency | client)");

    // 2. parent_account_id self-FK + lookup index
    await c.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS parent_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT`);
    await c.query(`CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_account_id) WHERE parent_account_id IS NOT NULL`);
    console.log("  ✓ accounts.parent_account_id (self-FK, ON DELETE RESTRICT) + idx_accounts_parent");

    // 3. at-most-one account-scope admin membership per account
    await c.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_account_admin ON memberships(scope_id) WHERE scope_type = 'account' AND role = 'admin'`);
    console.log("  ✓ uq_account_admin (≤1 account-scope admin per account)");

    await c.query("COMMIT");

    // report
    const def = (await c.query(`
      SELECT pg_get_constraintdef(oid) d FROM pg_constraint
      WHERE conrelid='accounts'::regclass AND conname='accounts_type_check'`)).rows[0]?.d;
    const hasCol = (await c.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='accounts' AND column_name='parent_account_id'`)).rows.length > 0;
    console.log(`\n  type check def: ${def}`);
    console.log(`  parent_account_id present: ${hasCol}`);
    console.log("\nDone (additive schema only). SEED is deferred to after task #31 (derivePrincipal-by-type).");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("\nFAILED — rolled back.", e.message);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
