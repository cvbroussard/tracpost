/**
 * Migrate (cosmetic, zero-risk): rename the leftover idx_subscriptions_* indexes
 * on the `accounts` table to idx_accounts_*.
 *
 * migrate-137 renamed subscriptions -> accounts but left these explicitly-created
 * index names with the old prefix. Index names are pure labels — renaming them
 * touches no data, no queries, no code. Idempotent + transactional.
 *
 * (The other *_subscription / *_subscriber index names on other tables mirror the
 * old subscription_id column token, which is part of the deferred subscriptionId
 * naming debt — deliberately left alone here.)
 *
 * Run:  node scripts/migrate-rename-accounts-indexes.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

const RENAMES = [
  ["idx_subscriptions_is_test", "idx_accounts_is_test"],
  ["idx_subscriptions_plan_id", "idx_accounts_plan_id"],
  ["idx_subscriptions_status", "idx_accounts_status"],
  ["idx_subscriptions_status_active", "idx_accounts_status_active"],
];

async function indexExists(c, name) {
  const { rows } = await c.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname=$1`, [name]);
  return rows.length > 0;
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    for (const [oldName, newName] of RENAMES) {
      const hasOld = await indexExists(c, oldName);
      const hasNew = await indexExists(c, newName);
      if (!hasOld && hasNew) { console.log(`  · ${oldName} already renamed`); continue; }
      if (!hasOld && !hasNew) { console.log(`  ⚠ ${oldName} not found — skipping`); continue; }
      if (hasOld && hasNew) { console.log(`  ⚠ both ${oldName} and ${newName} exist — skipping`); continue; }
      await c.query(`ALTER INDEX ${oldName} RENAME TO ${newName}`);
      console.log(`  ✓ ${oldName} → ${newName}`);
    }
    await c.query("COMMIT");
    console.log("\nDone (index names only; no data/query/code impact).");
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("\nFAILED — rolled back.", e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
