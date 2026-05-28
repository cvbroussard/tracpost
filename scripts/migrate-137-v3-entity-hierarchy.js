/**
 * Migration 137 — v3 entity-hierarchy + auth restructure (DRAFT — review before running).
 *
 * Renames the core entity tables and stands up the membership-based auth model.
 * See docs/schema-audit-v3.md for the full blast-radius inventory and the
 * landmines this migration is written to dodge.
 *
 * TARGET HIERARCHY:  Account(Direct|Agency) → Business → Brand(deferred) → Location → GBP Profile
 *
 * RENAMES:
 *   subscriptions            → accounts        (+ type, + stripe_account_id)
 *   sites                    → businesses      (subscription_id → account_id via discovery loop)
 *   branches                 → locations       (gbp_location_id → gbp_profile_id; site_id → business_id)
 *   asset_branches           → asset_locations (branch_id → location_id)
 *   gbp_locations            → gbp_profiles    (its OWN gbp_location_id column is Google's ID — NOT renamed)
 *   service_areas_canonical  → service_areas
 *   site_gbp_categories      → business_gbp_categories
 *   site_social_links        → business_social_links
 *   site_platform_assets     → business_platform_assets
 *
 * GLOBAL COLUMN SWEEPS (discovery-based, so they catch every table incl. the
 * FK-less migrate-136 production tables and users.site_id — audit landmines #4, #9):
 *   every  site_id          → business_id
 *   every  subscription_id  → account_id
 *
 * NEW: memberships table (consolidates the TWO live identity mechanisms — `users`
 *   + the ADMIN_PASSWORD env cookie; `team_members` was already dropped in 030c).
 *   Backfilled from `users`. Operator/Platform users are NOT created here (separate seed).
 *
 * DELIBERATELY NOT DONE (kept for the dual-read window / out of scope):
 *   - Does NOT drop users.account_id / users.role / users.business_id (dual-read needs them).
 *     A follow-up migrate-138 drops them after the code cutover is verified.
 *   - Does NOT create a `brands` table (Brand extraction deferred; brand_dna stays on businesses).
 *   - Does NOT touch application code (that's the codemod sweep — docs/v3-sweep-plan.md).
 *   - Does NOT drop the lingering site_service_areas trigger FUNCTION — it may be a SHARED
 *     set_updated_at(); verify table-specificity first (punch-list item, NOT here).
 *
 * ATOMICITY: unlike sibling migrations (plain neon() HTTP, non-transactional), this one
 *   wraps everything in a single BEGIN/COMMIT via the WebSocket Pool so the rename is
 *   all-or-nothing. Prereq: `ws` must be installed (npm i -D ws) — or run on Node ≥22.
 *
 * Run: node scripts/migrate-137-v3-entity-hierarchy.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* Node ≥22 native WS */ }

const TABLE_RENAMES = [
  ["gbp_locations", "gbp_profiles"],          // do FIRST — frees the `locations` namespace
  ["branches", "locations"],
  ["asset_branches", "asset_locations"],
  ["subscriptions", "accounts"],
  ["sites", "businesses"],
  ["service_areas_canonical", "service_areas"],
  ["site_gbp_categories", "business_gbp_categories"],
  ["site_social_links", "business_social_links"],
  ["site_platform_assets", "business_platform_assets"],
];

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`, [name]);
  return rows.length > 0;
}
async function columnExists(client, table, col) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [table, col]);
  return rows.length > 0;
}

async function migrate() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    // ── Preconditions (read-only) ──────────────────────────────────
    console.log("Preconditions:");
    for (const [from] of [["sites"], ["subscriptions"]]) {
      const seen = await tableExists(client, from);
      console.log(`  ${seen ? "→" : "·"} ${from} ${seen ? "present (will rename)" : "absent (already migrated?)"}`);
    }
    if (await tableExists(client, "team_members")) {
      console.log("  ⚠ team_members still exists — audit said it was dropped in 030c. INVESTIGATE before continuing.");
    }
    const roleRows = (await client.query(`SELECT role, COUNT(*)::int n FROM users GROUP BY role ORDER BY n DESC`)).rows;
    console.log(`  users roles present: ${roleRows.map(r => `${r.role}=${r.n}`).join(", ")}  ← verify backfill mapping below`);

    await client.query("BEGIN");

    // ── Phase 1: table renames ─────────────────────────────────────
    console.log("\nPhase 1 — table renames:");
    for (const [from, to] of TABLE_RENAMES) {
      if (await tableExists(client, from)) {
        await client.query(`ALTER TABLE ${from} RENAME TO ${to}`);
        console.log(`  ✓ ${from} → ${to}`);
      } else {
        console.log(`  · ${from} absent (skip)`);
      }
    }

    // ── Phase 2: account typing ────────────────────────────────────
    console.log("\nPhase 2 — account typing:");
    await client.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'direct'`);
    // add the CHECK separately so re-runs don't duplicate it
    const hasTypeCheck = (await client.query(
      `SELECT 1 FROM pg_constraint WHERE conname='accounts_type_check'`)).rows.length > 0;
    if (!hasTypeCheck) {
      await client.query(`ALTER TABLE accounts ADD CONSTRAINT accounts_type_check CHECK (type IN ('direct','agency'))`);
    }
    await client.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS stripe_account_id TEXT`);
    console.log("  ✓ accounts.type (+check), accounts.stripe_account_id");

    // ── Phase 3: global column sweeps (discovery-based) ────────────
    console.log("\nPhase 3 — column sweeps:");
    const siteIdTables = (await client.query(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema='public' AND column_name='site_id' ORDER BY table_name`)).rows;
    for (const { table_name } of siteIdTables) {
      await client.query(`ALTER TABLE ${table_name} RENAME COLUMN site_id TO business_id`);
    }
    console.log(`  ✓ site_id → business_id across ${siteIdTables.length} tables`);

    // subscription_id → billing_account_id (NOT account_id — `account_id` is already
    // taken by the social-platform-account meaning on social_accounts/social_posts/
    // publishing_slots/social_account_analytics; renaming to account_id collided).
    const subIdTables = (await client.query(
      `SELECT table_name FROM information_schema.columns
       WHERE table_schema='public' AND column_name='subscription_id' ORDER BY table_name`)).rows;
    for (const { table_name } of subIdTables) {
      await client.query(`ALTER TABLE ${table_name} RENAME COLUMN subscription_id TO billing_account_id`);
    }
    console.log(`  ✓ subscription_id → billing_account_id across ${subIdTables.length} tables`);

    // explicit, scoped renames (NOT site_id/subscription_id — must be per-table)
    if (await columnExists(client, "locations", "gbp_location_id")) {
      await client.query(`ALTER TABLE locations RENAME COLUMN gbp_location_id TO gbp_profile_id`);
      console.log("  ✓ locations.gbp_location_id → gbp_profile_id");
    }
    // NOTE: gbp_profiles.gbp_location_id is Google's external ID — intentionally LEFT ALONE.
    if (await columnExists(client, "asset_locations", "branch_id")) {
      await client.query(`ALTER TABLE asset_locations RENAME COLUMN branch_id TO location_id`);
      console.log("  ✓ asset_locations.branch_id → location_id");
    }

    // ── Phase 4: constraint-name hygiene (discovery-based) ─────────
    console.log("\nPhase 4 — constraint renames:");
    for (const [oldPrefix, newPrefix, table] of [
      ["sites_", "businesses_", "businesses"],
      ["subscriptions_", "accounts_", "accounts"],
    ]) {
      const cons = (await client.query(
        `SELECT conname FROM pg_constraint WHERE conname LIKE $1`, [oldPrefix + "%"])).rows;
      for (const { conname } of cons) {
        const newname = conname.replace(oldPrefix, newPrefix);
        await client.query(`ALTER TABLE ${table} RENAME CONSTRAINT ${conname} TO ${newname}`);
      }
      if (cons.length) console.log(`  ✓ ${cons.length} ${oldPrefix}* constraints → ${newPrefix}*`);
    }
    // (FK constraint names like users_subscription_id_fkey and index names are left as cosmetic
    //  debt — they don't affect behavior. See punch-list if you want them cleaned.)

    // ── Phase 5: memberships table + backfill ──────────────────────
    console.log("\nPhase 5 — memberships:");
    await client.query(`
      CREATE TABLE IF NOT EXISTS memberships (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        scope_type  TEXT NOT NULL CHECK (scope_type IN ('platform','operator','account','business')),
        scope_id    UUID,
        role        TEXT NOT NULL CHECK (role IN ('admin','member')),
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_scoped
      ON memberships(user_id, scope_type, scope_id) WHERE scope_id IS NOT NULL`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_membership_global
      ON memberships(user_id, scope_type) WHERE scope_id IS NULL`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_membership_user ON memberships(user_id)`);
    console.log("  ✓ memberships table + indexes");

    const memCount = (await client.query(`SELECT COUNT(*)::int n FROM memberships`)).rows[0].n;
    if (memCount === 0) {
      // All current accounts are type='direct', so owners become business-admins (app.tracpost.com),
      // NOT account-admins (agency surface). Verify the role list logged in preconditions.
      const owners = await client.query(`
        INSERT INTO memberships (user_id, scope_type, scope_id, role)
        SELECT u.id, 'business', b.id, 'admin'
        FROM users u JOIN businesses b ON b.billing_account_id = u.billing_account_id
        WHERE u.role = 'owner'`);
      const team = await client.query(`
        INSERT INTO memberships (user_id, scope_type, scope_id, role)
        SELECT u.id, 'business', u.business_id,
               CASE WHEN u.role IN ('admin','manager') THEN 'admin' ELSE 'member' END
        FROM users u
        WHERE u.role <> 'owner' AND u.business_id IS NOT NULL`);
      console.log(`  ✓ backfilled ${owners.rowCount} owner + ${team.rowCount} team memberships`);
    } else {
      console.log(`  · memberships already has ${memCount} rows — skipping backfill`);
    }

    await client.query("COMMIT");

    // ── Verification (read-only, post-commit) ──────────────────────
    console.log("\nVerification:");
    for (const [from, to] of TABLE_RENAMES) {
      const gone = !(await tableExists(client, from));
      const there = await tableExists(client, to);
      console.log(`  ${gone && there ? "✓" : "⚠"} ${to} present=${there}, ${from} gone=${gone}`);
    }
    const leftoverSite = (await client.query(
      `SELECT COUNT(*)::int n FROM information_schema.columns WHERE column_name='site_id' AND table_schema='public'`)).rows[0].n;
    const leftoverSub = (await client.query(
      `SELECT COUNT(*)::int n FROM information_schema.columns WHERE column_name='subscription_id' AND table_schema='public'`)).rows[0].n;
    console.log(`  ${leftoverSite === 0 ? "✓" : "⚠"} remaining site_id columns: ${leftoverSite}`);
    console.log(`  ${leftoverSub === 0 ? "✓" : "⚠"} remaining subscription_id columns: ${leftoverSub}`);
    const mem = (await client.query(`SELECT COUNT(*)::int n FROM memberships`)).rows[0].n;
    console.log(`  ✓ memberships rows: ${mem}`);

    console.log("\nMigration 137 complete — v3 entity hierarchy in place. Old columns retained for dual-read.");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("\nMigration 137 FAILED — rolled back. No changes applied.");
    console.error("ERR:", e.message);
    console.error(e.stack);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
