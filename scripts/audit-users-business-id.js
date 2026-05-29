/**
 * AUDIT (read-only): users.business_id → membership scope coverage.
 *
 * Track B prep. users.business_id is the legacy "site scope" axis (a team
 * member bound to a single business). v3 moves this to the business
 * membership's scope_id. Before cutting reads over, confirm every site-scoped
 * user (business_id NOT NULL) already has a business membership scoped to that
 * same business. Any gaps need a backfill migration first, or their scoping
 * would silently change on cutover.
 *
 * Pure SELECTs — no writes. Safe to run anytime.
 *
 * Run:  node scripts/audit-users-business-id.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* Node ≥22 native WS */ }

async function q(client, label, text) {
  const { rows } = await client.query(text);
  console.log(`\n— ${label} —`);
  if (rows.length === 0) { console.log("  (none)"); return rows; }
  for (const r of rows) console.log("  " + JSON.stringify(r));
  return rows;
}

async function audit() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    await q(client, "users WITH business_id set (total + by role_legacy)", `
      SELECT role_legacy, COUNT(*)::int n
      FROM users WHERE business_id IS NOT NULL
      GROUP BY role_legacy ORDER BY role_legacy`);

    await q(client, "site-scoped users MISSING a matching business membership (need backfill)", `
      SELECT u.id, u.email, u.role_legacy, u.business_id, u.is_active
      FROM users u
      WHERE u.business_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM memberships m
          WHERE m.user_id = u.id AND m.scope_type = 'business'
            AND m.scope_id = u.business_id
        )`);

    await q(client, "site-scoped users WITH a matching membership (capability on it)", `
      SELECT u.role_legacy, m.capability, COUNT(*)::int n
      FROM users u
      JOIN memberships m ON m.user_id = u.id AND m.scope_type = 'business' AND m.scope_id = u.business_id
      WHERE u.business_id IS NOT NULL
      GROUP BY u.role_legacy, m.capability ORDER BY u.role_legacy, m.capability`);

    await q(client, "INTEGRITY: business_id pointing to a business NOT in the user's account", `
      SELECT u.id, u.email, u.business_id, u.billing_account_id
      FROM users u
      JOIN businesses b ON b.id = u.business_id
      WHERE u.business_id IS NOT NULL
        AND b.billing_account_id IS DISTINCT FROM u.billing_account_id`);

    await q(client, "site-scoped users who are ALSO the account owner (business_id on an owner is unusual)", `
      SELECT u.id, u.email, u.business_id
      FROM users u
      JOIN accounts a ON a.id = u.billing_account_id
      WHERE u.business_id IS NOT NULL AND a.owner_user_id = u.id`);

    console.log("\nAudit complete (read-only).");
  } catch (e) {
    console.error("AUDIT FAILED:", e.message);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

audit();
