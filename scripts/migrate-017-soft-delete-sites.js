const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 017: Soft delete for sites...\n");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  console.log("  + sites.deleted_at column");

  await sql`CREATE INDEX IF NOT EXISTS idx_sites_deleted ON sites(deleted_at) WHERE deleted_at IS NOT NULL`;
  console.log("  + sites.deleted_at index");

  console.log("\nMigration 017 complete.");
}

migrate().catch((err) => {
  console.error("Migration 017 failed:", err);
  process.exit(1);
});
