const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 018: Site deletion request columns...\n");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS deletion_reason TEXT`;
  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS deletion_status TEXT`;
  console.log("  + sites.deletion_requested_at, deletion_reason, deletion_status columns");

  console.log("\nMigration 018 complete.");
}

migrate().catch((err) => {
  console.error("Migration 018 failed:", err);
  process.exit(1);
});
