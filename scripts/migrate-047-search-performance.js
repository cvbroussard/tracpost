/**
 * Migration 047: Search performance table for Google Search Console data.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  console.log("047: Search performance table...");

  await sql`
    CREATE TABLE IF NOT EXISTS search_performance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      query TEXT NOT NULL,
      impressions INTEGER NOT NULL DEFAULT 0,
      clicks INTEGER NOT NULL DEFAULT 0,
      ctr REAL NOT NULL DEFAULT 0,
      position REAL NOT NULL DEFAULT 0,
      date DATE NOT NULL,
      UNIQUE(site_id, url, query, date)
    )
  `;
  console.log("  + search_performance table");

  await sql`CREATE INDEX IF NOT EXISTS idx_search_perf_site_date ON search_performance(site_id, date)`;
  console.log("  + index on site_id, date");

  // Store the Search Console property URL per site
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS gsc_property TEXT`;
  console.log("  + sites.gsc_property");

  console.log("\n047: Done.");
}

migrate().catch((err) => { console.error(err); process.exit(1); });
