/**
 * v2 redesign polish: projects_v2.display_name.
 *
 * The LLM generator produces article-style titles for projects ("West
 * Shadyside: How a Historic Home Gets a Kitchen That Actually Works").
 * Those work as page titles but read awkwardly when cited inline by
 * other articles ("...as we did on West Shadyside: How a Historic Home...").
 *
 * Adds a `display_name` column for the short, operator-friendly name
 * (e.g., "West Shadyside Kitchen Remodel") that other articles use
 * when linking to this project. The full title stays in `name`.
 *
 * Backfill: for each existing v2 project, find its hero asset's tagged
 * legacy project via asset_projects join, copy legacy.name → display_name.
 * This works for any tenant whose v2 projects were migrated from legacy.
 *
 * Run: node scripts/migrate-098-project-display-name.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Adding projects_v2.display_name + backfilling from legacy projects...");

  await sql`
    ALTER TABLE projects_v2
      ADD COLUMN IF NOT EXISTS display_name TEXT
  `;
  console.log("  ✓ Column added");

  // Backfill: find each v2 project's hero asset's legacy project, copy name.
  const backfilled = await sql`
    UPDATE projects_v2 v2
    SET display_name = legacy.name
    FROM asset_projects ap
    JOIN projects legacy ON legacy.id = ap.project_id
    WHERE v2.hero_asset_id = ap.asset_id
      AND v2.display_name IS NULL
    RETURNING v2.id, v2.name AS v2_name, legacy.name AS legacy_name
  `;
  console.log(`  ✓ Backfilled ${backfilled.length} v2 project rows`);
  for (const r of backfilled) {
    console.log(`     "${r.v2_name.slice(0, 50)}..." → display_name = "${r.legacy_name}"`);
  }

  console.log("");
  console.log("Migration complete.");
}

migrate().catch((e) => {
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
