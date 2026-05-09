/**
 * Drop media_assets.content_pillar + media_assets.content_pillars.
 *
 * Per the architectural lock 2026-05-09: pillars are NOT stored on the
 * asset. They derive at read time from content_tags + sites.pillar_config
 * via pillarsFromTags() / primaryPillarFromTags() in src/lib/pillars.ts.
 *
 * Phase history:
 *  Phase 1 — writers retired (commit 08f2b92): triage + PATCH stopped
 *           writing content_pillar / content_pillars on the asset.
 *  Phase 2a — major readers migrated (commit ae7c1cd): autopilot-publisher,
 *           content-matcher, gbp/photos, media-grid, dashboard/media/page.
 *  Phase 2b — remaining readers migrated (commit 1dfa08e): blog-generator,
 *           video-pool, slot-filler, v2 generator strategies + adapters,
 *           compose/recommend, prompt-inspector blog, google/photos endpoints.
 *  Phase 3 — THIS migration: drop the columns. Existing data lost; no
 *           rollback path other than re-deriving from content_tags (which
 *           subscribers and AI now control entirely).
 *
 * Scope: applies ONLY to media_assets. blog_posts.content_pillar and
 * social_posts.content_pillar are SEPARATE columns on different tables
 * (snapshot fields written at generate/publish time) and stay.
 *
 * Run: node scripts/migrate-106-drop-asset-pillar-columns.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  // Pre-drop sanity check: count rows that have populated values (for
  // operator visibility — these values become unreachable after drop)
  const [pre] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE content_pillar IS NOT NULL)::int AS with_pillar,
      COUNT(*) FILTER (WHERE content_pillars IS NOT NULL AND array_length(content_pillars, 1) > 0)::int AS with_pillars_arr,
      COUNT(*)::int AS total
    FROM media_assets
  `;
  console.log(
    `Pre-drop counts: ${pre.with_pillar} rows have content_pillar set, ` +
    `${pre.with_pillars_arr} have populated content_pillars[], ${pre.total} total assets.`
  );
  console.log(`These values will be permanently lost — pillar membership re-derives from content_tags.`);

  console.log("Dropping media_assets.content_pillar...");
  await sql`ALTER TABLE media_assets DROP COLUMN IF EXISTS content_pillar`;
  console.log("  ✓ content_pillar dropped");

  console.log("Dropping media_assets.content_pillars...");
  await sql`ALTER TABLE media_assets DROP COLUMN IF EXISTS content_pillars`;
  console.log("  ✓ content_pillars dropped");

  // Verify
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'media_assets'
      AND column_name IN ('content_pillar', 'content_pillars')
  `;
  if (cols.length === 0) {
    console.log("  ✓ verified — neither column present on media_assets");
  } else {
    console.warn(`  ⚠ unexpected: still found ${cols.map(c => c.column_name).join(", ")}`);
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
