const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Running SEO payload migrations...\n");

  // Add url and canonical_url columns to seo_content if missing
  await sql`
    ALTER TABLE seo_content
    ADD COLUMN IF NOT EXISTS url TEXT,
    ADD COLUMN IF NOT EXISTS canonical_url TEXT,
    ADD COLUMN IF NOT EXISTS og_image TEXT
  `;
  console.log("✓ seo_content — added url, canonical_url, og_image columns");

  // Add url column to seo_audits if missing
  // (url column already exists in base migration, but ensure it's there)

  // Index for fast payload lookups by site_id + url
  await sql`
    CREATE INDEX IF NOT EXISTS idx_seo_content_site_url
    ON seo_content(site_id, url)
  `;
  console.log("✓ idx_seo_content_site_url index");

  console.log("\n✅ SEO payload migrations complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
