/**
 * Migrate: memberships.capability  (the function / capability axis)
 *
 * Adds the third role axis to memberships, per the settled v3 model:
 *   scope_type (surface) + role (admin|member, tier) + capability (job/function).
 * Enum: full | capture | reviewer.  (`capability`, not `function`, to avoid the
 * SQL/JS reserved word.)  Lives PER-MEMBERSHIP because it's relative to a
 * business (reviewer for client A, full for client B). Meaningful at business
 * scope; left NULL for platform/operator/account.
 *
 * Additive + idempotent:
 *   - adds a nullable column (safest DDL — no rewrite, no existing data touched)
 *   - backfills BUSINESS memberships from the user's legacy users.role
 *     (capture/reviewer → that; everything else → full); only fills NULLs
 *   - NO behavior change: reads still use users.role until rewired in a later step
 *
 * Run:  node scripts/migrate-membership-capability.js
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
    const has = await columnExists(client, "memberships", "capability");
    console.log(`Preconditions:\n  · memberships.capability exists = ${has ? "YES" : "NO"}`);

    await client.query("BEGIN");

    if (!has) {
      await client.query(`ALTER TABLE memberships ADD COLUMN capability TEXT`);
      console.log("  ✓ added memberships.capability (nullable)");
    } else {
      console.log("  · column already present — skipping ADD");
    }

    // Backfill business memberships from the user's legacy role. Idempotent —
    // only fills rows where capability IS NULL.
    const res = await client.query(`
      UPDATE memberships m
      SET capability = CASE u.role
        WHEN 'capture'  THEN 'capture'
        WHEN 'reviewer' THEN 'reviewer'
        ELSE 'full'
      END
      FROM users u
      WHERE m.user_id = u.id
        AND m.scope_type = 'business'
        AND m.capability IS NULL
    `);
    console.log(`  ✓ backfilled capability on ${res.rowCount} business membership(s)`);

    await client.query("COMMIT");

    const dist = (await client.query(
      `SELECT capability, COUNT(*)::int n FROM memberships
       WHERE scope_type='business' GROUP BY capability ORDER BY capability`)).rows;
    console.log("  business-membership capability distribution:");
    for (const r of dist) console.log(`    ${r.capability ?? "(null)"}: ${r.n}`);

    console.log("\nMigration complete — membership.capability in place; reads still use users.role until rewired.");
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
