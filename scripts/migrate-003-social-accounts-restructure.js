const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

/**
 * Migration 003: Restructure social_accounts
 *
 * Move social account ownership from site-level to subscriber-level.
 * Add join table site_social_links for many-to-many relationship.
 *
 * Changes:
 * - Add subscriber_id column to social_accounts (direct ownership)
 * - Make site_id nullable (no longer required)
 * - Create site_social_links join table
 * - Backfill subscriber_id from existing site relationships
 * - Migrate existing site_id links into join table
 * - Drop old unique constraint, add new one scoped to subscriber
 */
async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Running migration 003: social accounts restructure...\n");

  // 1. Add subscriber_id to social_accounts
  await sql`
    ALTER TABLE social_accounts
    ADD COLUMN IF NOT EXISTS subscriber_id UUID REFERENCES subscribers(id) ON DELETE CASCADE
  `;
  console.log("✓ Added subscriber_id to social_accounts");

  // 2. Backfill subscriber_id from site relationships
  await sql`
    UPDATE social_accounts sa
    SET subscriber_id = s.subscriber_id
    FROM sites s
    WHERE sa.site_id = s.id
      AND sa.subscriber_id IS NULL
  `;
  console.log("✓ Backfilled subscriber_id from existing sites");

  // 3. Create join table
  await sql`
    CREATE TABLE IF NOT EXISTS site_social_links (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      linked_at       TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(site_id, social_account_id)
    )
  `;
  console.log("✓ Created site_social_links");

  // 4. Migrate existing site_id links into join table
  await sql`
    INSERT INTO site_social_links (site_id, social_account_id)
    SELECT sa.site_id, sa.id
    FROM social_accounts sa
    WHERE sa.site_id IS NOT NULL
    ON CONFLICT (site_id, social_account_id) DO NOTHING
  `;
  console.log("✓ Migrated existing links to join table");

  // 5. Drop old unique constraint and add new subscriber-scoped one
  // The old constraint is (site_id, platform, account_id)
  await sql`
    ALTER TABLE social_accounts
    DROP CONSTRAINT IF EXISTS social_accounts_site_id_platform_account_id_key
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_social_accounts_subscriber_platform_account
    ON social_accounts(subscriber_id, platform, account_id)
  `;
  console.log("✓ Updated unique constraint to subscriber scope");

  // 6. Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_social_accounts_subscriber ON social_accounts(subscriber_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_site_social_links_site ON site_social_links(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_site_social_links_account ON site_social_links(social_account_id)`;
  console.log("✓ Indexes created");

  console.log("\n✅ Migration 003 complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
