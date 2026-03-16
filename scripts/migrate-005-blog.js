const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Running blog microsite migrations...\n");

  // Blog settings — per-site blog configuration
  await sql`
    CREATE TABLE IF NOT EXISTS blog_settings (
      site_id           UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
      blog_enabled      BOOLEAN DEFAULT false,
      subdomain         TEXT UNIQUE,
      custom_domain     TEXT UNIQUE,
      blog_title        TEXT,
      blog_description  TEXT,
      nav_links         JSONB DEFAULT '[]',
      theme             JSONB DEFAULT '{}',
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✓ blog_settings");

  // Blog posts — generated from media assets via pipeline
  await sql`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      source_asset_id   UUID REFERENCES media_assets(id),
      slug              TEXT NOT NULL,
      title             TEXT NOT NULL,
      body              TEXT NOT NULL,
      excerpt           TEXT,
      meta_title        TEXT,
      meta_description  TEXT,
      og_image_url      TEXT,
      schema_json       JSONB,
      tags              TEXT[] DEFAULT '{}',
      content_pillar    TEXT,
      status            TEXT DEFAULT 'draft',
      published_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW(),
      updated_at        TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(site_id, slug)
    )
  `;
  console.log("✓ blog_posts");

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_blog_posts_site_status ON blog_posts (site_id, status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts (site_id, published_at DESC) WHERE status = 'published'`;
  await sql`CREATE INDEX IF NOT EXISTS idx_blog_posts_asset ON blog_posts (source_asset_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_blog_settings_subdomain ON blog_settings (subdomain) WHERE subdomain IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_blog_settings_custom_domain ON blog_settings (custom_domain) WHERE custom_domain IS NOT NULL`;
  console.log("✓ indexes");

  console.log("\n✅ Blog microsite migration complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
