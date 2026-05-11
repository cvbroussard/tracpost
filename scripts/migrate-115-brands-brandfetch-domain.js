/**
 * Migration 115: Add brands.brandfetch_domain for Pattern C rendering.
 *
 * Pattern C: capture canonical icon to R2 as a resilience safety net,
 * but render variants from Brandfetch CDN at runtime when available.
 * The CDN serves icons / logos / symbols / themes / sizes — all from
 * the same domain mapping, no per-variant storage needed.
 *
 * `brandfetch_domain` stores the apex domain Brandfetch indexed
 * the brand under (e.g. "thermador.com" not "https://thermador.com").
 * Renderers construct CDN URLs via the brandfetchLogoUrl helper.
 *
 * Set during enrichment when the Brandfetch candidate succeeds; null
 * otherwise. Brands without it fall back to the R2-cached hero_url.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("115: Adding brands.brandfetch_domain column...");
  await sql`ALTER TABLE brands ADD COLUMN IF NOT EXISTS brandfetch_domain TEXT`;
  console.log("  + brands.brandfetch_domain column");

  // Backfill from enrichment_metadata.hero_source for any brand whose
  // existing logo came from a Brandfetch CDN URL.
  const result = await sql`
    UPDATE brands
    SET brandfetch_domain = regexp_replace(
      enrichment_metadata->>'hero_source',
      '^https://cdn\\.brandfetch\\.io/([^?/]+).*$',
      '\\1'
    )
    WHERE brandfetch_domain IS NULL
      AND enrichment_metadata->>'hero_source' LIKE 'https://cdn.brandfetch.io/%'
  `;
  console.log(`  + backfilled ${result.length ?? "?"} rows from existing Brandfetch hero_source`);

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'brands' AND column_name = 'brandfetch_domain'
  `;
  for (const c of cols) {
    console.log(`\n  ${c.column_name}  ${c.data_type}`);
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
