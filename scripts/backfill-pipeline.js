#!/usr/bin/env node
/**
 * Backfill script — brings all assets to current pipeline standard.
 *
 * 1. Trash all unpublished social posts (draft, scheduled, failed)
 * 2. Reset render_status to 'pending' on all image assets
 * 3. Clear stale generated_text so the merged triage regenerates it
 * 4. Leave published posts + articles + assets untouched
 *
 * Run: node scripts/backfill-pipeline.js [--dry-run] [--site-id=UUID]
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes("--dry-run");
const siteArg = process.argv.find((a) => a.startsWith("--site-id="));
const siteId = siteArg ? siteArg.split("=")[1] : null;

async function main() {
  console.log(dryRun ? "DRY RUN\n" : "LIVE RUN\n");

  const siteClause = siteId ? `AND site_id = '${siteId}'` : "";
  const siteJoinClause = siteId
    ? `AND ssl.site_id = '${siteId}'`
    : "";

  // ── 1. Count unpublished social posts ──
  const [postCounts] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE sp.status = 'draft')::int AS drafts,
      COUNT(*) FILTER (WHERE sp.status = 'scheduled')::int AS scheduled,
      COUNT(*) FILTER (WHERE sp.status = 'failed')::int AS failed,
      COUNT(*) FILTER (WHERE sp.status = 'published')::int AS published
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE 1=1 ${siteId ? sql`AND ssl.site_id = ${siteId}` : sql``}
  `;

  console.log("=== Social Posts ===");
  console.log(`  Drafts:    ${postCounts.drafts} → TRASH`);
  console.log(`  Scheduled: ${postCounts.scheduled} → TRASH`);
  console.log(`  Failed:    ${postCounts.failed} → TRASH`);
  console.log(`  Published: ${postCounts.published} → KEEP`);

  if (!dryRun) {
    const trashed = await sql`
      DELETE FROM social_posts
      WHERE status IN ('draft', 'scheduled', 'failed')
        AND id IN (
          SELECT sp.id FROM social_posts sp
          JOIN social_accounts sa ON sp.account_id = sa.id
          JOIN site_social_links ssl ON ssl.social_account_id = sa.id
          WHERE sp.status IN ('draft', 'scheduled', 'failed')
          ${siteId ? sql`AND ssl.site_id = ${siteId}` : sql``}
        )
      RETURNING id
    `;
    console.log(`  Trashed: ${trashed.length} posts\n`);
  }

  // ── 2. Reset render_status + clear generated_text ──
  const [assetCounts] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE render_status = 'rendered')::int AS rendered,
      COUNT(*) FILTER (WHERE render_status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE metadata->'generated_text' IS NOT NULL
        AND metadata->'generated_text'->>'generated_at' IS NOT NULL)::int AS has_text
    FROM media_assets
    WHERE media_type LIKE 'image%'
      AND triage_status IN ('triaged', 'scheduled', 'consumed')
      ${siteId ? sql`AND site_id = ${siteId}` : sql``}
  `;

  console.log("=== Image Assets ===");
  console.log(`  Total triaged: ${assetCounts.total}`);
  console.log(`  Already rendered: ${assetCounts.rendered} → RESET to pending`);
  console.log(`  Has generated_text: ${assetCounts.has_text} → CLEAR for re-generation`);

  if (!dryRun) {
    // Reset render status
    const renderReset = await sql`
      UPDATE media_assets
      SET render_status = 'pending',
          variants = '{}'::jsonb
      WHERE media_type LIKE 'image%'
        AND triage_status IN ('triaged', 'scheduled', 'consumed')
        ${siteId ? sql`AND site_id = ${siteId}` : sql``}
      RETURNING id
    `;
    console.log(`  Render reset: ${renderReset.length} assets`);

    // Clear generated_text so merged triage regenerates it
    const textCleared = await sql`
      UPDATE media_assets
      SET metadata = COALESCE(metadata, '{}'::jsonb) - 'generated_text'
      WHERE media_type LIKE 'image%'
        AND triage_status IN ('triaged', 'scheduled', 'consumed')
        AND metadata->'generated_text' IS NOT NULL
        ${siteId ? sql`AND site_id = ${siteId}` : sql``}
      RETURNING id
    `;
    console.log(`  Generated text cleared: ${textCleared.length} assets`);
  }

  // ── 3. Clear render_history (stale records for old variants) ──
  const [histCount] = await sql`
    SELECT COUNT(*)::int AS n FROM render_history
    ${siteId ? sql`WHERE asset_id IN (SELECT id FROM media_assets WHERE site_id = ${siteId})` : sql``}
  `;
  console.log(`\n=== Render History ===`);
  console.log(`  Records: ${histCount.n} → CLEAR`);

  if (!dryRun) {
    if (siteId) {
      await sql`DELETE FROM render_history WHERE asset_id IN (SELECT id FROM media_assets WHERE site_id = ${siteId})`;
    } else {
      await sql`DELETE FROM render_history`;
    }
    console.log(`  Cleared.`);
  }

  // ── 4. Summary ──
  console.log("\n=== Next Steps ===");
  console.log("Assets are now in 'pending' render state with no generated_text.");
  console.log("The pipeline cron will pick them up in batches of 50:");
  console.log("  - Merged triage regenerates generated_text (with enriched playbook context)");
  console.log("  - Render variants produced per platform");
  console.log("  - New social posts will be created by the slot-filler as autopilot runs");
  console.log(`\nEstimated processing time: ~${Math.ceil(assetCounts.total / 50) * 3} minutes`);
  console.log("(50 assets per cron cycle, ~3 min per cycle)");

  if (dryRun) console.log("\nRe-run without --dry-run to execute.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
