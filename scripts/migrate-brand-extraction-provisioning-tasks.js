/**
 * Migration: Brand Extraction provisioning_tasks expansion.
 *
 * Replaces the single 'playbook' task with a multi-step Brand Extraction
 * sub-pipeline:
 *
 *   UPSTREAM (platform-driven observation):
 *     brand_public_presence      Public Presence Analysis
 *     brand_cma                  Competitive Market Analysis
 *     brand_triage               Type A/B/C/D triage
 *     brand_readiness_findings   Findings consolidation
 *     brand_findings_resolved    Owner resolves findings (tenant)
 *
 *   DOMAIN ROLLUPS (tenant-driven declarations, parallel):
 *     brand_strategic            5 sub-tasks
 *     brand_verbal               9 sub-tasks
 *     brand_visual               6 sub-tasks
 *     brand_sonic                2 sub-tasks
 *
 *   CONVERGENCE:
 *     brand_identity_complete    System gate; deps on all 4 domains
 *
 * Dep rewires (preserve existing downstream invariants while decoupling
 * from the retired 'playbook' task):
 *   - social_accounts.depends_on: 'playbook' → 'business_info'
 *     (account connection doesn't need brand identity; the OLD coupling
 *     was an artifact of the one-shot playbook generation)
 *   - first_content.depends_on: adds 'brand_identity_complete'
 *     (this IS where brand identity matters — content generation reads
 *     the catalog via getBrandPlaybookFromDescriptor)
 *
 * Resequences sort_order across the full pipeline (1-22).
 *
 * Idempotent per billing_account: skips brands that already have the
 * brand_public_presence task. Transactional per brand.
 *
 * Run: node scripts/migrate-brand-extraction-provisioning-tasks.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
const { randomUUID } = require("crypto");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

// ── New task definitions ────────────────────────────────────────────────────

// Order matters: depends_on references must point to task_keys defined
// above the dependent (or to pre-existing tasks like business_info).
const NEW_TASKS = [
  // Upstream observation gates
  {
    task_key: "brand_public_presence",
    title: "Public Presence Analysis",
    owner: "platform",
    depends_on: ["business_info"],
    milestone: "Brand observed",
    sort_order: 3,
  },
  {
    task_key: "brand_cma",
    title: "Competitive Market Analysis",
    owner: "platform",
    depends_on: ["business_info"],
    milestone: "Market positioned",
    sort_order: 4,
  },
  {
    task_key: "brand_triage",
    title: "Brand triage (A/B/C/D)",
    owner: "platform",
    depends_on: ["brand_public_presence", "brand_cma"],
    milestone: "Audit grade assigned",
    sort_order: 5,
  },
  {
    task_key: "brand_readiness_findings",
    title: "Readiness findings consolidated",
    owner: "platform",
    depends_on: ["brand_triage"],
    milestone: "Findings ready",
    sort_order: 6,
  },
  {
    task_key: "brand_findings_resolved",
    title: "Owner resolves findings",
    owner: "tenant",
    depends_on: ["brand_readiness_findings"],
    milestone: "Brand gaps closed",
    sort_order: 7,
  },
  // Domain rollups (parallel, all depend on findings_resolved)
  {
    task_key: "brand_strategic",
    title: "Strategic domain declared",
    owner: "tenant",
    depends_on: ["brand_findings_resolved"],
    milestone: "Strategic catalog populated",
    sort_order: 8,
    sub_tasks: ["positioning", "audience", "offer", "proof", "cta"],
  },
  {
    task_key: "brand_verbal",
    title: "Verbal domain declared",
    owner: "tenant",
    depends_on: ["brand_findings_resolved"],
    milestone: "Verbal catalog populated",
    sort_order: 9,
    sub_tasks: [
      "voice_source",
      "voice_source.character",
      "tone.attributes",
      "tone.example",
      "tone.effect",
      "mechanical_style",
      "lexicon",
      "avoid",
      "tagline",
    ],
  },
  {
    task_key: "brand_visual",
    title: "Visual domain declared",
    owner: "tenant",
    depends_on: ["brand_findings_resolved"],
    milestone: "Visual catalog populated",
    sort_order: 10,
    sub_tasks: [
      "aesthetic",
      "environmental_look",
      "subject_style",
      "palette",
      "logo",
      "do_not_show",
    ],
  },
  {
    task_key: "brand_sonic",
    title: "Sonic domain declared",
    owner: "tenant",
    depends_on: ["brand_findings_resolved"],
    milestone: "Sonic catalog populated",
    sort_order: 11,
    sub_tasks: ["composite_specimen", "pronunciation"],
  },
  // Convergence gate
  {
    task_key: "brand_identity_complete",
    title: "Brand identity ready",
    owner: "platform",
    depends_on: ["brand_strategic", "brand_verbal", "brand_visual", "brand_sonic"],
    milestone: "Catalog canonical",
    sort_order: 12,
  },
];

// Resequencing map for existing tasks (their depends_on stays mostly the same;
// social_accounts + first_content get rewired separately).
const RESEQUENCED_EXISTING = {
  checkout: 1,
  business_info: 2,
  social_accounts: 13,
  oauth_connect: 14,
  gbp_oauth: 15,
  gbp_location: 16,
  domain_provision: 17,
  dns_config: 18,
  first_upload: 19,
  first_content: 20,
  autopilot: 21,
  search_console: 22,
};

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();

  try {
    // Enumerate all billing_account_ids that have existing provisioning tasks
    const accounts = await c.query(
      "SELECT DISTINCT billing_account_id FROM provisioning_tasks ORDER BY billing_account_id",
    );
    console.log(`Found ${accounts.rows.length} billing accounts with provisioning tasks.`);

    for (const { billing_account_id } of accounts.rows) {
      console.log(`\n── billing_account ${billing_account_id} ──`);
      await c.query("BEGIN");
      try {
        // Idempotency: skip if Brand Extraction already migrated
        const already = await c.query(
          "SELECT 1 FROM provisioning_tasks WHERE billing_account_id = $1 AND task_key = 'brand_public_presence' LIMIT 1",
          [billing_account_id],
        );
        if (already.rowCount > 0) {
          console.log("  ℹ already migrated; skipping");
          await c.query("COMMIT");
          continue;
        }

        // 1. Insert new tasks + their sub_tasks
        for (const t of NEW_TASKS) {
          const taskId = randomUUID();
          await c.query(
            `INSERT INTO provisioning_tasks
              (id, billing_account_id, task_key, title, owner, depends_on, status,
               milestone, sort_order, step_label)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9)`,
            [
              taskId,
              billing_account_id,
              t.task_key,
              t.title,
              t.owner,
              t.depends_on,
              t.milestone,
              t.sort_order,
              String(t.sort_order),
            ],
          );
          console.log(`  + task ${t.task_key} (sort ${t.sort_order})`);
          if (Array.isArray(t.sub_tasks)) {
            for (let i = 0; i < t.sub_tasks.length; i++) {
              const subKey = t.sub_tasks[i];
              await c.query(
                `INSERT INTO provisioning_sub_tasks
                  (id, task_id, sub_key, title, status, sort_order)
                 VALUES ($1, $2, $3, $4, 'pending', $5)`,
                [randomUUID(), taskId, subKey, subKey, i + 1],
              );
            }
            console.log(`      ${t.sub_tasks.length} sub_tasks`);
          }
        }

        // 2. Retire the old playbook task (delete its sub_tasks first, then the row)
        await c.query(
          `DELETE FROM provisioning_sub_tasks WHERE task_id IN
             (SELECT id FROM provisioning_tasks WHERE billing_account_id = $1 AND task_key = 'playbook')`,
          [billing_account_id],
        );
        const deleted = await c.query(
          "DELETE FROM provisioning_tasks WHERE billing_account_id = $1 AND task_key = 'playbook' RETURNING task_key",
          [billing_account_id],
        );
        if (deleted.rowCount > 0) console.log(`  - retired task 'playbook'`);

        // 3. Re-wire dependencies — replace any depends_on reference to 'playbook'
        //    with 'business_info' (decouple account/domain branches from the
        //    retired playbook task).
        await c.query(
          `UPDATE provisioning_tasks
           SET depends_on = array_replace(depends_on, 'playbook', 'business_info')
           WHERE billing_account_id = $1 AND 'playbook' = ANY(depends_on)`,
          [billing_account_id],
        );
        console.log(`  ⇄ rewired depends_on('playbook') → depends_on('business_info')`);

        // 4. first_content also depends on brand_identity_complete now —
        //    content generation reads the catalog.
        await c.query(
          `UPDATE provisioning_tasks
           SET depends_on = ARRAY(SELECT DISTINCT unnest(depends_on || ARRAY['brand_identity_complete']::text[]))
           WHERE billing_account_id = $1 AND task_key = 'first_content'`,
          [billing_account_id],
        );
        console.log(`  ⇄ first_content.depends_on += brand_identity_complete`);

        // 5. Resequence sort_order for existing tasks
        for (const [task_key, sort_order] of Object.entries(RESEQUENCED_EXISTING)) {
          await c.query(
            `UPDATE provisioning_tasks
             SET sort_order = $1, step_label = $2
             WHERE billing_account_id = $3 AND task_key = $4`,
            [sort_order, String(sort_order), billing_account_id, task_key],
          );
        }
        console.log(`  ⇄ resequenced sort_order for ${Object.keys(RESEQUENCED_EXISTING).length} existing tasks`);

        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        console.error(`  ❌ rolled back: ${e.message}`);
        throw e;
      }
    }

    console.log("\n✅ Brand Extraction migration complete");
  } catch (e) {
    console.error("\n❌ migration failed:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
