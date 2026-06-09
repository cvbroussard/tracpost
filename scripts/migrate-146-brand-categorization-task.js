/**
 * Migration 146: brand_categorization provisioning task.
 *
 * Adds a dedicated platform-owned provisioning task for GBP category
 * canonicalization. Per the theoretical model established in conversation:
 *
 *   - Categorization is a DERIVED platform-owned step (tenant never picks
 *     from the 4000-category dropdown).
 *   - It belongs UPSTREAM of brand_cma (CMA reads business_gbp_categories
 *     for peer matching + query derivation).
 *   - It is RECURRING per [[ppa-cma-recurring-quality-gate]] — Run #1 is
 *     a coarse first-pass from business_info signals; Run #N (verification)
 *     happens via the coaching ceremony after CMA + catalog mature.
 *
 * Architecture:
 *   sort_order:    3 (parallel sibling to brand_public_presence at sort 3)
 *   owner:         platform
 *   depends_on:    ['business_info']
 *   milestone:     "Categories canonical"
 *   step_label:    "Brand identity"  (groups with other brand_* tasks)
 *
 * Dependency edge update:
 *   brand_cma.depends_on was ['business_info']
 *                       now ['business_info', 'brand_categorization']
 *   brand_public_presence DOES NOT depend on categorization — PPA observes
 *   the brand independently of GBP taxonomy. CMA is the consumer.
 *
 * Backfill: brands with any business_gbp_categories.is_primary=true row
 * get their brand_categorization task marked 'complete'. Per the audit:
 *   - B2 (10 cats, coaching) → complete
 *   - Epicurious Kitchens (4 cats, 1 primary) → complete
 *   - TracPost (4 cats, 1 primary) → complete
 *   - Hektor K9, Arhaus, Testi Renovations (0 cats) → pending
 *
 * Run: node scripts/migrate-146-brand-categorization-task.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
const { randomUUID } = require("crypto");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    const accounts = await c.query(
      "SELECT DISTINCT billing_account_id FROM provisioning_tasks ORDER BY billing_account_id",
    );
    console.log(`Found ${accounts.rows.length} billing accounts to update.\n`);

    for (const { billing_account_id } of accounts.rows) {
      console.log(`── billing_account ${billing_account_id} ──`);
      await c.query("BEGIN");
      try {
        // 1. Insert brand_categorization task (idempotent).
        const existing = await c.query(
          "SELECT id FROM provisioning_tasks WHERE billing_account_id = $1 AND task_key = 'brand_categorization'",
          [billing_account_id],
        );
        if (existing.rowCount === 0) {
          await c.query(`
            INSERT INTO provisioning_tasks
              (id, billing_account_id, task_key, title, owner, depends_on, status, milestone, sort_order, step_label)
            VALUES (
              $1, $2, 'brand_categorization',
              'Brand categorization (GBP taxonomy)',
              'platform',
              ARRAY['business_info']::text[],
              'pending',
              'Categories canonical',
              3,
              'Brand identity'
            )
          `, [randomUUID(), billing_account_id]);
          console.log("  ✓ inserted brand_categorization task at sort_order=3");
        } else {
          console.log("  ⊙ brand_categorization already exists; skipping insert");
        }

        // 2. Update brand_cma.depends_on to include brand_categorization.
        //    Only adds if not already present; preserves existing edges.
        await c.query(`
          UPDATE provisioning_tasks
          SET depends_on = ARRAY(
            SELECT DISTINCT unnest(depends_on || ARRAY['brand_categorization']::text[])
          )
          WHERE billing_account_id = $1 AND task_key = 'brand_cma'
            AND NOT ('brand_categorization' = ANY(depends_on))
        `, [billing_account_id]);
        console.log("  ✓ brand_cma.depends_on now includes brand_categorization");

        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        console.error(`  ❌ rolled back: ${e.message}`);
        throw e;
      }
    }

    console.log("\n✅ brand_categorization task migration complete\n");

    // Verify final dependency shape for one account.
    const sample = await c.query(`
      SELECT task_key, sort_order, owner, depends_on
      FROM provisioning_tasks
      WHERE billing_account_id = $1
        AND (task_key IN ('business_info', 'brand_categorization',
                          'brand_public_presence', 'brand_cma', 'brand_triage'))
      ORDER BY sort_order, task_key
    `, [accounts.rows[0].billing_account_id]);
    console.log("Brand-identity-front dependency shape (account 1):");
    for (const r of sample.rows) {
      console.log(`  ${String(r.sort_order).padStart(2)}. ${r.task_key.padEnd(26)} owner=${r.owner.padEnd(8)} depends_on=${JSON.stringify(r.depends_on)}`);
    }
  } catch (e) {
    console.error("\n❌ migration failed:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
