/**
 * Migration 042: Site-relative quality thresholds.
 * Adds quality_thresholds JSONB column to sites table.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("042: Quality thresholds...");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS quality_thresholds JSONB DEFAULT '{}'::jsonb`;
  console.log("  + sites.quality_thresholds (JSONB)");

  // Backfill existing sites with current percentiles
  const sites = await sql`
    SELECT s.id, s.name
    FROM sites s
    WHERE s.is_active = true
  `;

  for (const site of sites) {
    const [stats] = await sql`
      SELECT
        COUNT(*)::int AS count,
        PERCENTILE_CONT(0.20) WITHIN GROUP (ORDER BY quality_score) AS p20,
        PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY quality_score) AS p50,
        PERCENTILE_CONT(0.80) WITHIN GROUP (ORDER BY quality_score) AS p80,
        MIN(quality_score) AS min_score,
        MAX(quality_score) AS max_score
      FROM media_assets
      WHERE site_id = ${site.id}
        AND triage_status IN ('triaged', 'consumed')
        AND quality_score IS NOT NULL
    `;

    if (stats.count >= 5) {
      const thresholds = {
        p20: Math.round((stats.p20 || 0) * 100) / 100,
        p50: Math.round((stats.p50 || 0) * 100) / 100,
        p80: Math.round((stats.p80 || 0) * 100) / 100,
        min: Math.round((stats.min_score || 0) * 100) / 100,
        max: Math.round((stats.max_score || 0) * 100) / 100,
        count: stats.count,
        updated_at: new Date().toISOString(),
      };

      await sql`
        UPDATE sites SET quality_thresholds = ${JSON.stringify(thresholds)}::jsonb
        WHERE id = ${site.id}
      `;
      console.log(`  ${site.name}: p20=${thresholds.p20} p50=${thresholds.p50} p80=${thresholds.p80} (n=${thresholds.count})`);
    } else {
      console.log(`  ${site.name}: ${stats.count} assets — too few, using absolute defaults`);
    }
  }

  console.log("\n042: Done.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
