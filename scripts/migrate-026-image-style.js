/**
 * Migration 026: Site-level image style + variations
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 026: Image style fields on sites...");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS image_style TEXT`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS image_variations JSONB DEFAULT '[]'`;
  console.log("  ✓ image_style and image_variations added to sites");

  console.log("Migration 026 complete.");
}

migrate().catch(console.error);
