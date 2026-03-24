const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 019: Site provisioning status...\n");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS provisioning_status TEXT`;
  console.log("  + sites.provisioning_status column");

  // Backfill: sites with playbooks are 'complete', others without deleted_at are 'requested'
  await sql`UPDATE sites SET provisioning_status = 'complete' WHERE brand_playbook IS NOT NULL AND deleted_at IS NULL AND provisioning_status IS NULL`;
  await sql`UPDATE sites SET provisioning_status = 'requested' WHERE brand_playbook IS NULL AND deleted_at IS NULL AND provisioning_status IS NULL`;
  console.log("  + Backfilled existing sites");

  console.log("\nMigration 019 complete.");
}

migrate().catch((err) => {
  console.error("Migration 019 failed:", err);
  process.exit(1);
});
