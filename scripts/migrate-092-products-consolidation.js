/**
 * Migration 092: Products consolidation — products becomes the canonical
 * source of truth for tier + plan. subscriptions.product_id FK by id
 * (not name) replaces the fragile fuzzy-match pattern.
 *
 * Per session decision (2026-05-05): Model A — bundled tiers. Tier and
 * plan and product collapse into one concept; the products table is the
 * source. The previously free-form subscriptions.plan TEXT column gets a
 * proper FK alongside it (kept as denormalized cache for one release).
 *
 * Additive only — does not drop the legacy plan column. Existing reads
 * continue working until the sweep that follows replaces them.
 *
 * What this does:
 *   1. Add products.gating_features TEXT[] — code-readable feature flags
 *      ('ads', 'reach_step', 'auto_boost', 'unitrac_access') distinct
 *      from products.features[] which is marketing-display.
 *   2. Add products.tier TEXT — canonical tier identifier
 *      ('free','growth','authority','enterprise'), CHECK-constrained.
 *   3. Insert Free product row if missing (currently no products row
 *      backs the default 'free' subscriptions.plan text value).
 *   4. Seed tier + gating_features on existing products.
 *   5. Add subscriptions.product_id UUID REFERENCES products(id).
 *   6. Backfill product_id from existing plan text via case-insensitive
 *      name match.
 *
 * Verification at the end reports any subscriptions still without a
 * product_id (should be 0; investigate any non-zero before proceeding
 * to the sweep that replaces fuzzy checks with hasFeature()).
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("092: products consolidation — FK + gating_features + tier...");

  // ── 1. products.gating_features ─────────────────────────────
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS gating_features TEXT[] DEFAULT '{}'::TEXT[]`;
  console.log("  + products.gating_features TEXT[] (default empty)");

  // ── 2. products.tier (with CHECK constraint) ─────────────────
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS tier TEXT`;
  // Add CHECK constraint defensively (idempotent — drop+add)
  await sql`ALTER TABLE products DROP CONSTRAINT IF EXISTS products_tier_check`;
  await sql`
    ALTER TABLE products
    ADD CONSTRAINT products_tier_check
    CHECK (tier IS NULL OR tier IN ('free','growth','authority','enterprise'))
  `;
  console.log("  + products.tier TEXT with CHECK (free|growth|authority|enterprise)");

  // ── 3. Ensure Free product row exists ─────────────────────────
  // Currently the default 'free' subscriptions.plan has no backing row.
  // Insert one with full marketing metadata so the FK can land cleanly.
  const [freeExists] = await sql`SELECT id FROM products WHERE LOWER(name) = 'free' LIMIT 1`;
  if (!freeExists) {
    await sql`
      INSERT INTO products (
        name, tagline, price, frequency, features, cta_text, cta_href,
        highlight, sort_order, stripe_price_id, is_active, tier, gating_features
      )
      VALUES (
        'Free',
        'Try the autopilot.',
        '$0',
        '/month',
        ${JSON.stringify(['1 site', '1 platform connection', 'Manual publishing only', 'Capture + media library'])}::jsonb,
        'Start free',
        NULL,
        false,
        0,
        NULL,
        true,
        'free',
        '{}'::TEXT[]
      )
    `;
    console.log("  + inserted Free product row");
  } else {
    console.log("  + Free product row already exists; skipping insert");
  }

  // ── 4. Seed tier + gating_features on existing products ──────
  // Tier derived from name (case-insensitive). gating_features per Model A
  // bundled-tier rules: lower tiers empty, Enterprise gets the full set.
  await sql`UPDATE products SET tier = 'free' WHERE tier IS NULL AND LOWER(name) = 'free'`;
  await sql`UPDATE products SET tier = 'growth' WHERE tier IS NULL AND LOWER(name) = 'growth'`;
  await sql`UPDATE products SET tier = 'authority' WHERE tier IS NULL AND LOWER(name) = 'authority'`;
  await sql`UPDATE products SET tier = 'enterprise' WHERE tier IS NULL AND LOWER(name) = 'enterprise'`;

  // Enterprise gating features — every feature currently behind a
  // session.plan.includes("enterprise") check, plus future capabilities
  // (UniTrac, auto-boost) so code can rely on them being present.
  await sql`
    UPDATE products
    SET gating_features = ARRAY['ads','reach_step','auto_boost','unitrac_access']::TEXT[]
    WHERE tier = 'enterprise'
      AND (gating_features IS NULL OR gating_features = '{}'::TEXT[])
  `;
  console.log("  + seeded tier + gating_features on Free/Growth/Authority/Enterprise");

  // ── 5. subscriptions.product_id ──────────────────────────────
  await sql`ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS product_id UUID`;
  await sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE table_name = 'subscriptions'
          AND constraint_name = 'subscriptions_product_id_fkey'
      ) THEN
        ALTER TABLE subscriptions
        ADD CONSTRAINT subscriptions_product_id_fkey
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
      END IF;
    END $$
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_subscriptions_product_id ON subscriptions(product_id) WHERE product_id IS NOT NULL`;
  console.log("  + subscriptions.product_id UUID (FK to products.id)");
  console.log("  + index on subscriptions.product_id");

  // ── 6. Backfill product_id from existing plan text ───────────
  await sql`
    UPDATE subscriptions s
    SET product_id = p.id
    FROM products p
    WHERE s.product_id IS NULL
      AND LOWER(s.plan) = LOWER(p.name)
  `;
  console.log("  + backfilled product_id via case-insensitive name match");

  // ── Verification ─────────────────────────────────────────────
  const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM subscriptions`;
  const [{ matched }] = await sql`
    SELECT COUNT(*)::int AS matched FROM subscriptions WHERE product_id IS NOT NULL
  `;
  const unmatched = await sql`
    SELECT id, plan FROM subscriptions WHERE product_id IS NULL ORDER BY created_at DESC LIMIT 10
  `;
  const productBreakdown = await sql`
    SELECT p.name, p.tier, COUNT(s.id)::int AS subscription_count
    FROM products p
    LEFT JOIN subscriptions s ON s.product_id = p.id
    GROUP BY p.id, p.name, p.tier, p.sort_order
    ORDER BY p.sort_order
  `;

  console.log("");
  console.log("✓ Migration 092 complete.");
  console.log(`  Subscriptions total: ${total} · matched to product: ${matched}`);
  if (unmatched.length > 0) {
    console.log(`  ⚠ ${unmatched.length} subscription(s) still without product_id — review:`);
    for (const u of unmatched) {
      console.log(`    ${u.id} (legacy plan='${u.plan}')`);
    }
  }
  console.log("  Per-product subscription breakdown:");
  for (const row of productBreakdown) {
    console.log(`    ${String(row.name).padEnd(15)} (tier=${row.tier ?? "NULL"}): ${row.subscription_count}`);
  }
  console.log("");
  console.log("Next: lib/plans.ts helper (hasFeature, isEnterprise, getActiveProduct) + sweep");
  console.log("of 11 fuzzy session.plan.includes() checks across the codebase.");
}

migrate().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
