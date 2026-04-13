/**
 * One-off: nuke the TracPost-as-tenant subscription + everything that
 * cascades from it. Useful when re-doing the self-tenant onboarding
 * and you want a clean slate.
 *
 * Usage: node scripts/reset-tracpost-tenant.js <subscription_id_or_site_id> [--yes]
 *
 * Cascading deletes (via FK ON DELETE CASCADE):
 *   subscriptions → users (owner + team), sites, social_accounts,
 *                   usage_log, etc.
 *   sites → blog_settings, media_assets, projects, brands, ...
 *
 * Always shows what will be deleted before doing it; pass --yes to skip
 * the interactive confirmation.
 */
const { neon } = require("@neondatabase/serverless");
const readline = require("node:readline");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const idArg = process.argv[2];
  const skipConfirm = process.argv.includes("--yes");
  if (!idArg) {
    console.error("Usage: node scripts/reset-tracpost-tenant.js <subscription_id_or_site_id> [--yes]");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  // Resolve to subscription_id whether they passed a site_id or subscription_id
  let subscriptionId = idArg;
  const [asSite] = await sql`SELECT subscription_id FROM sites WHERE id = ${idArg}`;
  if (asSite) {
    subscriptionId = asSite.subscription_id;
    console.log(`Resolved site ${idArg} → subscription ${subscriptionId}`);
  }

  // Verify subscription exists
  const [sub] = await sql`SELECT id, plan, created_at FROM subscriptions WHERE id = ${subscriptionId}`;
  if (!sub) {
    console.error(`No subscription found for id ${subscriptionId}`);
    process.exit(1);
  }

  // Show what will be deleted
  const owners = await sql`
    SELECT id, name, email, role FROM users WHERE subscription_id = ${subscriptionId}
  `;
  const sites = await sql`
    SELECT id, name, blog_slug FROM sites WHERE subscription_id = ${subscriptionId}
  `;
  const blogSettings = await sql`
    SELECT bs.site_id, bs.subdomain, bs.custom_domain
    FROM blog_settings bs
    JOIN sites s ON s.id = bs.site_id
    WHERE s.subscription_id = ${subscriptionId}
  `;
  const socialAccounts = await sql`
    SELECT id, platform, account_name FROM social_accounts WHERE subscription_id = ${subscriptionId}
  `;
  const mediaCount = await sql`
    SELECT COUNT(*)::int AS n FROM media_assets ma
    JOIN sites s ON s.id = ma.site_id
    WHERE s.subscription_id = ${subscriptionId}
  `;

  console.log("\nWill delete:");
  console.log(`  subscription:       ${sub.id} (plan: ${sub.plan}, created: ${sub.created_at})`);
  console.log(`  users:              ${owners.length}`);
  for (const u of owners) console.log(`                      - ${u.role.padEnd(8)} ${u.email || "(no email)"}  ${u.name}`);
  console.log(`  sites:              ${sites.length}`);
  for (const s of sites) console.log(`                      - ${s.name}  (slug: ${s.blog_slug ?? "—"})`);
  console.log(`  blog_settings:      ${blogSettings.length}`);
  for (const b of blogSettings) {
    console.log(`                      - subdomain=${b.subdomain ?? "—"}  custom=${b.custom_domain ?? "—"}`);
  }
  console.log(`  social_accounts:    ${socialAccounts.length}`);
  for (const a of socialAccounts) console.log(`                      - ${a.platform}  ${a.account_name}`);
  console.log(`  media_assets:       ${mediaCount[0].n}`);
  console.log(`  + cascading rows in projects, brands, posts, usage_log, etc.`);

  if (!skipConfirm) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((resolve) =>
      rl.question(`\nType 'delete' to confirm (or anything else to abort): `, resolve)
    );
    rl.close();
    if (answer.trim().toLowerCase() !== "delete") {
      console.log("Aborted.");
      process.exit(0);
    }
  }

  await sql`DELETE FROM subscriptions WHERE id = ${subscriptionId}`;
  console.log(`\nDeleted subscription ${subscriptionId} (CASCADE handled the rest).`);

  // Heads-up about R2
  console.log("\nNote: R2 objects under sites/<deleted_site_id>/ are now orphaned.");
  console.log("They become unreachable from the app but still cost storage until a sweep job runs.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
