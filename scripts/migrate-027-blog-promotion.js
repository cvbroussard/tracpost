/**
 * Migration 027: Blog promotion tracking
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 027: Blog promotion fields...");

  await sql`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS promotion_status TEXT`;
  await sql`ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS promotion_metadata JSONB`;
  console.log("  ✓ promotion_status and promotion_metadata added to blog_posts");

  console.log("Migration 027 complete.");
}

migrate().catch(console.error);
