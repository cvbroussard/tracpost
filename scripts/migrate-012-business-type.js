const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 012: Business type + location on sites...\n");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS business_type TEXT`;
  console.log("  + sites.business_type");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS location TEXT`;
  console.log("  + sites.location");

  console.log("\nMigration 012 complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
