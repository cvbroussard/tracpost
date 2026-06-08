/**
 * Migration: collapse 3 OAuth-authorization tasks into 1 `integrations` task.
 *
 * Before:
 *   13. social_accounts   (8 sub_tasks: per-platform "Create X account")
 *   14. oauth_connect     (8 sub_tasks: per-platform "Connect X")
 *   15. gbp_oauth         (no sub_tasks)
 *   16. gbp_location      (no sub_tasks)               ← stays separate
 *
 * After:
 *   13. integrations      (8 sub_tasks: per-platform OAuth authorization)
 *   14. gbp_location      (unchanged purpose; sort bumped from 16 → 14)
 *
 * Per the [[provisioning-drawer-console]] doctrine and 2026-06-07 user
 * direction: the three OAuth-authorization cards were all variations on
 * "connect a platform"; splitting them was confusing the per-platform
 * mental model. gbp_location stays separate because "assign physical
 * location to the GBP profile" is a distinct downstream step that
 * happens AFTER OAuth, not part of OAuth.
 *
 * Dependency rewires:
 *   - first_upload.depends_on:  [oauth_connect] → [integrations]
 *   - gbp_location.depends_on:  [gbp_oauth] → [integrations]
 *     (strict: gbp_location won't be actionable until all integrations
 *     connect. Acceptable — recompute reads the real GBP state independent
 *     of the depends_on graph, so the gate is purely UI semantics.)
 *   - autopilot.depends_on stays as [first_content, gbp_location].
 *
 * Sort_order resequencing:
 *   12 brand_identity_complete
 *   13 integrations          (NEW; replaces 13/14/15)
 *   14 gbp_location          (was 16)
 *   15 domain_provision      (was 17)
 *   16 dns_config            (was 18)
 *   17 first_upload          (was 19)
 *   18 first_content         (was 20)
 *   19 autopilot             (was 21)
 *   20 search_console        (was 22)
 *
 * Idempotent per billing_account: skips brands that already have the
 * integrations task. Transactional per brand.
 *
 * Run: node scripts/migrate-consolidate-integrations-task.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
const { randomUUID } = require("crypto");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

// GBP-first ordering per the 2026-06-07 doctrine lock: for TracPost's
// local-services target market, Google Business is the foundational
// presence (search visibility + reviews + photos) — it belongs at slot
// #1 in every integrations list, ahead of the social platforms.
const PLATFORMS = [
  { key: "gbp", title: "Connect Google Business" },
  { key: "instagram", title: "Connect Instagram" },
  { key: "facebook", title: "Connect Facebook" },
  { key: "tiktok", title: "Connect TikTok" },
  { key: "youtube", title: "Connect YouTube" },
  { key: "pinterest", title: "Connect Pinterest" },
  { key: "linkedin", title: "Connect LinkedIn" },
  { key: "twitter", title: "Connect X (Twitter)" },
];

const RESEQUENCED = {
  gbp_location: 14,
  domain_provision: 15,
  dns_config: 16,
  first_upload: 17,
  first_content: 18,
  autopilot: 19,
  search_console: 20,
};

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();

  try {
    const accounts = await c.query(
      "SELECT DISTINCT billing_account_id FROM provisioning_tasks ORDER BY billing_account_id",
    );
    console.log(`Found ${accounts.rows.length} billing accounts with provisioning tasks.`);

    for (const { billing_account_id } of accounts.rows) {
      console.log(`\n── billing_account ${billing_account_id} ──`);
      await c.query("BEGIN");
      try {
        // Idempotency: skip if integrations task already exists.
        const already = await c.query(
          "SELECT 1 FROM provisioning_tasks WHERE billing_account_id = $1 AND task_key = 'integrations' LIMIT 1",
          [billing_account_id],
        );
        if (already.rowCount > 0) {
          console.log("  ℹ already migrated; skipping");
          await c.query("COMMIT");
          continue;
        }

        // 1. Insert new integrations task + 8 platform sub_tasks
        const integrationsId = randomUUID();
        await c.query(
          `INSERT INTO provisioning_tasks
            (id, billing_account_id, task_key, title, owner, depends_on, status,
             milestone, sort_order, step_label)
           VALUES ($1, $2, 'integrations', 'Integrations connected', 'tenant',
                   $3, 'pending', 'Platforms authorized', 13, '13')`,
          [integrationsId, billing_account_id, ["business_info"]],
        );
        console.log("  + task integrations (sort 13)");
        for (let i = 0; i < PLATFORMS.length; i++) {
          const p = PLATFORMS[i];
          await c.query(
            `INSERT INTO provisioning_sub_tasks
              (id, task_id, sub_key, title, status, sort_order)
             VALUES ($1, $2, $3, $4, 'pending', $5)`,
            [randomUUID(), integrationsId, p.key, p.title, i + 1],
          );
        }
        console.log(`      ${PLATFORMS.length} platform sub_tasks`);

        // 2. Retire the 3 old OAuth-authorization tasks (sub_tasks first,
        //    then the rows). gbp_location stays — it's a separate downstream
        //    step (assign physical location to the GBP profile).
        const oldKeys = ["social_accounts", "oauth_connect", "gbp_oauth"];
        await c.query(
          `DELETE FROM provisioning_sub_tasks WHERE task_id IN
             (SELECT id FROM provisioning_tasks
              WHERE billing_account_id = $1 AND task_key = ANY($2))`,
          [billing_account_id, oldKeys],
        );
        const deleted = await c.query(
          `DELETE FROM provisioning_tasks
           WHERE billing_account_id = $1 AND task_key = ANY($2)
           RETURNING task_key`,
          [billing_account_id, oldKeys],
        );
        console.log(`  - retired ${deleted.rowCount} legacy task(s): ${deleted.rows.map(r => r.task_key).join(", ")}`);

        // 3. Rewire dependencies — replace deleted task_keys with 'integrations'
        await c.query(
          `UPDATE provisioning_tasks
           SET depends_on = ARRAY(
             SELECT DISTINCT CASE
               WHEN d = ANY($2::text[]) THEN 'integrations'
               ELSE d
             END FROM unnest(depends_on) AS d
           )
           WHERE billing_account_id = $1 AND depends_on && $2::text[]`,
          [billing_account_id, oldKeys],
        );
        console.log("  ⇄ rewired depends_on(social_accounts/oauth_connect/gbp_oauth/gbp_location) → depends_on(integrations)");

        // 4. Resequence sort_order for downstream tasks
        for (const [task_key, sort_order] of Object.entries(RESEQUENCED)) {
          await c.query(
            `UPDATE provisioning_tasks
             SET sort_order = $1, step_label = $2
             WHERE billing_account_id = $3 AND task_key = $4`,
            [sort_order, String(sort_order), billing_account_id, task_key],
          );
        }
        console.log(`  ⇄ resequenced sort_order for ${Object.keys(RESEQUENCED).length} downstream tasks`);

        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        console.error(`  ❌ rolled back: ${e.message}`);
        throw e;
      }
    }

    console.log("\n✅ integrations consolidation complete");
  } catch (e) {
    console.error("\n❌ migration failed:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
