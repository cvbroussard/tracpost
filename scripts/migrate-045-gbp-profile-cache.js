/**
 * Migration 045: GBP profile cache column on sites.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  console.log("045: GBP profile cache...");
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS gbp_profile JSONB DEFAULT '{}'::jsonb`;
  console.log("  + sites.gbp_profile (JSONB)");
  console.log("\n045: Done.");
}

migrate().catch((err) => { console.error(err); process.exit(1); });
