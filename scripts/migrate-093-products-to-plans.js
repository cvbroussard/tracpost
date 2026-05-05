/**
 * Migration 093: Rename products → plans (and subscriptions.product_id → plan_id).
 *
 * Per session decision following the products consolidation (mig 092) — "products"
 * was Stripe-borrowed naming; the canonical concept for TracPost (Model A,
 * bundled tiers) is plan. This rename aligns table + column + code to subscriber-
 * natural language. "Tier" stays as an attribute on the row (plans.tier) — a
 * level descriptor, not the noun for the thing.
 *
 * Atomic with the source-code sweep that updates all FROM products → FROM plans
 * references in the same commit. Run this migration on prod BEFORE deploying
 * the code or queries will break for the deploy window.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("093: rename products → plans + subscriptions.product_id → plan_id...");

  // ── Rename the FK constraint first to avoid name collision ──
  // The FK created in migration 092 was named subscriptions_product_id_fkey.
  // After we rename the column to plan_id we want the constraint to follow.
  // Postgres allows ALTER ... RENAME CONSTRAINT.
  const fkExists = await sql`
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'subscriptions'
      AND constraint_name = 'subscriptions_product_id_fkey'
  `;
  if (fkExists.length > 0) {
    await sql`ALTER TABLE subscriptions RENAME CONSTRAINT subscriptions_product_id_fkey TO subscriptions_plan_id_fkey`;
    console.log("  + renamed FK subscriptions_product_id_fkey → subscriptions_plan_id_fkey");
  }

  // ── Rename the column ──
  // ALTER ... RENAME COLUMN works whether the FK is in place or not.
  const colExists = await sql`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'product_id'
  `;
  if (colExists.length > 0) {
    await sql`ALTER TABLE subscriptions RENAME COLUMN product_id TO plan_id`;
    console.log("  + renamed subscriptions.product_id → plan_id");
  } else {
    console.log("  + subscriptions.product_id already renamed (or never existed); skipping");
  }

  // ── Rename the index ──
  const idxExists = await sql`
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_subscriptions_product_id'
  `;
  if (idxExists.length > 0) {
    await sql`ALTER INDEX idx_subscriptions_product_id RENAME TO idx_subscriptions_plan_id`;
    console.log("  + renamed idx_subscriptions_product_id → idx_subscriptions_plan_id");
  }

  // ── Rename the products table → plans ──
  const productsExists = await sql`
    SELECT 1 FROM information_schema.tables WHERE table_name = 'products'
  `;
  if (productsExists.length > 0) {
    await sql`ALTER TABLE products RENAME TO plans`;
    console.log("  + renamed products → plans");
  } else {
    console.log("  + products table already renamed (or never existed); skipping");
  }

  // ── Rename the CHECK constraint to follow the table ──
  const checkExists = await sql`
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'plans' AND constraint_name = 'products_tier_check'
  `;
  if (checkExists.length > 0) {
    await sql`ALTER TABLE plans RENAME CONSTRAINT products_tier_check TO plans_tier_check`;
    console.log("  + renamed CHECK products_tier_check → plans_tier_check");
  }

  // ── Verification ──
  const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM plans`;
  const [{ matched }] = await sql`SELECT COUNT(*)::int AS matched FROM subscriptions WHERE plan_id IS NOT NULL`;
  const [{ unmatched }] = await sql`SELECT COUNT(*)::int AS unmatched FROM subscriptions WHERE plan_id IS NULL`;
  const planBreakdown = await sql`
    SELECT p.name, p.tier, COUNT(s.id)::int AS sub_count
    FROM plans p
    LEFT JOIN subscriptions s ON s.plan_id = p.id
    GROUP BY p.id, p.name, p.tier, p.sort_order
    ORDER BY p.sort_order
  `;
  console.log(`\n✓ Migration 093 complete. ${total} plans · ${matched} subscriptions matched · ${unmatched} unmatched.`);
  console.log("  Per-plan subscription breakdown:");
  for (const row of planBreakdown) {
    console.log(`    ${String(row.name).padEnd(15)} (tier=${row.tier ?? "NULL"}): ${row.sub_count}`);
  }
}

migrate().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
