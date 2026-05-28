/**
 * Phase 3a.2 (retire users.role) — backfill owner business-admin memberships
 *
 * migrate-137 created owner memberships for the businesses that existed then.
 * Any business created since (this session's deploys) lacks an owner membership.
 * This ensures every business whose account has an owner has a corresponding
 * (business, admin, capability='full') membership for that owner.
 *
 * Additive + idempotent: ON CONFLICT DO NOTHING against the (user, scope_type,
 * scope_id) unique index, so existing memberships are untouched. No-op once
 * everything's in place. The provisioning routes now maintain this going
 * forward (Phase 3a.2 code), so this is the one-time catch-up.
 *
 * Run:  node scripts/migrate-owner-membership-catchup.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* Node ≥22 native WS */ }

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const missing = (await client.query(`
      SELECT count(*)::int n
      FROM businesses b JOIN accounts a ON a.id = b.billing_account_id
      WHERE a.owner_user_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM memberships m
          WHERE m.user_id = a.owner_user_id AND m.scope_type = 'business' AND m.scope_id = b.id
        )`)).rows[0].n;
    console.log(`Preconditions:\n  · businesses missing an owner membership: ${missing}`);

    await client.query("BEGIN");
    const res = await client.query(`
      INSERT INTO memberships (user_id, scope_type, scope_id, role, capability)
      SELECT a.owner_user_id, 'business', b.id, 'admin', 'full'
      FROM businesses b JOIN accounts a ON a.id = b.billing_account_id
      WHERE a.owner_user_id IS NOT NULL
      ON CONFLICT DO NOTHING
    `);
    await client.query("COMMIT");
    console.log(`  ✓ inserted ${res.rowCount} owner business-admin membership(s)`);
    console.log("\nPhase 3a.2 backfill complete — owners have business-admin memberships for all their businesses.");
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
