const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 023: Two-tier pillar system...\n");

  // Replace flat content_pillars TEXT[] with structured pillar_config JSONB
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS pillar_config JSONB DEFAULT '[]'`;
  console.log("  + sites.pillar_config JSONB column");

  // Add tags array to media_assets alongside content_pillars
  await sql`ALTER TABLE media_assets ADD COLUMN IF NOT EXISTS content_tags TEXT[] DEFAULT '{}'`;
  console.log("  + media_assets.content_tags column");

  // Add content_tags to blog_posts
  await sql`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS content_tags TEXT[] DEFAULT '{}'`;
  console.log("  + blog_posts.content_tags column");

  // Add content_tags to social_posts
  await sql`ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS content_tags TEXT[] DEFAULT '{}'`;
  console.log("  + social_posts.content_tags column");

  console.log("\nMigration 023 complete.");
}

migrate().catch((err) => {
  console.error("Migration 023 failed:", err);
  process.exit(1);
});
