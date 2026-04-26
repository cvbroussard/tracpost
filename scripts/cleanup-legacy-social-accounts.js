/**
 * Cleanup legacy social_accounts rows that have been replaced by the
 * platform_assets model.
 *
 * A row is "legacy" if its platform is one of the migrated platforms
 * (facebook, instagram, gbp, linkedin) AND it has no platform_assets
 * children. Those rows came from the pre-platform_assets OAuth callbacks.
 *
 * A row is safe to delete only if the same subscriber has a NEW MODEL
 * row covering the same platform:
 *   - facebook/instagram → subscriber has a 'meta' row with platform_assets
 *   - gbp                → subscriber has a 'google' row with platform_assets
 *   - linkedin           → subscriber has a 'linkedin' row WITH platform_assets
 *                           (the new callback writes platform_assets; the legacy
 *                            one did not)
 *
 * The CASCADE on social_accounts.id will remove site_social_links rows
 * automatically, no manual cleanup needed there.
 *
 * Run with --dry-run to preview. Without flag, performs the delete.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL);

  // Find legacy rows (no platform_assets children)
  const legacy = await sql`
    SELECT sa.id, sa.subscription_id, sa.platform, sa.account_name
    FROM social_accounts sa
    WHERE sa.platform IN ('facebook', 'instagram', 'gbp', 'linkedin')
      AND NOT EXISTS (
        SELECT 1 FROM platform_assets pa WHERE pa.social_account_id = sa.id
      )
  `;

  console.log(`Found ${legacy.length} legacy rows`);

  // Map subscriber → which new-model coverage they have
  const newCoverage = await sql`
    SELECT DISTINCT sa.subscription_id, sa.platform
    FROM social_accounts sa
    WHERE sa.platform IN ('meta', 'google', 'linkedin')
      AND EXISTS (
        SELECT 1 FROM platform_assets pa WHERE pa.social_account_id = sa.id
      )
  `;
  const coverageMap = new Map();
  for (const c of newCoverage) {
    if (!coverageMap.has(c.subscription_id)) coverageMap.set(c.subscription_id, new Set());
    coverageMap.get(c.subscription_id).add(c.platform);
  }

  function legacyIsSafeToDelete(row) {
    const sub = coverageMap.get(row.subscription_id) || new Set();
    if (row.platform === "facebook" || row.platform === "instagram") return sub.has("meta");
    if (row.platform === "gbp") return sub.has("google");
    if (row.platform === "linkedin") return sub.has("linkedin");
    return false;
  }

  const toDelete = legacy.filter(legacyIsSafeToDelete);
  const toKeep = legacy.filter((r) => !legacyIsSafeToDelete(r));

  console.log(`\nSafe to delete: ${toDelete.length}`);
  toDelete.forEach((r) =>
    console.log(`  - ${r.platform.padEnd(10)} ${r.account_name.padEnd(40)} (sub ${r.subscription_id.slice(0, 8)})`)
  );

  console.log(`\nKeep (no new-model replacement): ${toKeep.length}`);
  toKeep.forEach((r) =>
    console.log(`  - ${r.platform.padEnd(10)} ${r.account_name.padEnd(40)} (sub ${r.subscription_id.slice(0, 8)})`)
  );

  if (DRY_RUN) {
    console.log("\n[DRY RUN — no rows deleted. Re-run without --dry-run to apply.]");
    return;
  }

  if (toDelete.length === 0) {
    console.log("\nNothing to delete.");
    return;
  }

  let deleted = 0;
  for (const row of toDelete) {
    await sql`DELETE FROM social_accounts WHERE id = ${row.id}`;
    deleted++;
  }

  console.log(`\nDeleted ${deleted} legacy rows.`);
}

cleanup().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
