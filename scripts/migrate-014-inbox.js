const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 014: Unified Inbox tables...\n");

  // 1. inbox_comments
  await sql`
    CREATE TABLE IF NOT EXISTS inbox_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscriber_id UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      post_id UUID REFERENCES social_posts(id) ON DELETE SET NULL,
      platform TEXT NOT NULL,
      platform_post_id TEXT NOT NULL,
      platform_comment_id TEXT NOT NULL,
      parent_comment_id UUID,
      author_name TEXT,
      author_username TEXT,
      author_avatar_url TEXT,
      author_platform_id TEXT,
      body TEXT NOT NULL,
      commented_at TIMESTAMPTZ NOT NULL,
      is_read BOOLEAN DEFAULT false,
      is_hidden BOOLEAN DEFAULT false,
      our_reply TEXT,
      our_reply_at TIMESTAMPTZ,
      raw_data JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(platform, platform_comment_id)
    )
  `;
  console.log("  + inbox_comments table");

  await sql`CREATE INDEX IF NOT EXISTS idx_inbox_comments_site ON inbox_comments(site_id, is_read, commented_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inbox_comments_post ON inbox_comments(platform_post_id, commented_at ASC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inbox_comments_subscriber ON inbox_comments(subscriber_id, is_read)`;
  console.log("  + inbox_comments indexes");

  // 2. inbox_reviews
  await sql`
    CREATE TABLE IF NOT EXISTS inbox_reviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscriber_id UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      platform_review_id TEXT NOT NULL,
      reviewer_name TEXT,
      reviewer_avatar_url TEXT,
      rating INTEGER,
      body TEXT,
      reviewed_at TIMESTAMPTZ NOT NULL,
      is_read BOOLEAN DEFAULT false,
      is_hidden BOOLEAN DEFAULT false,
      our_reply TEXT,
      our_reply_at TIMESTAMPTZ,
      suggested_reply TEXT,
      suggested_reply_at TIMESTAMPTZ,
      raw_data JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(platform, platform_review_id)
    )
  `;
  console.log("  + inbox_reviews table");

  await sql`CREATE INDEX IF NOT EXISTS idx_inbox_reviews_site ON inbox_reviews(site_id, is_read, reviewed_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inbox_reviews_subscriber ON inbox_reviews(subscriber_id, is_read)`;
  console.log("  + inbox_reviews indexes");

  // 3. inbox_messages (Phase 3 — table created now, populated later)
  await sql`
    CREATE TABLE IF NOT EXISTS inbox_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscriber_id UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      platform_message_id TEXT NOT NULL,
      sender_name TEXT,
      sender_platform_id TEXT,
      sender_avatar_url TEXT,
      is_from_us BOOLEAN DEFAULT false,
      body TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL,
      is_read BOOLEAN DEFAULT false,
      raw_data JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(platform, platform_message_id)
    )
  `;
  console.log("  + inbox_messages table");

  await sql`CREATE INDEX IF NOT EXISTS idx_inbox_messages_conversation ON inbox_messages(conversation_id, sent_at ASC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_inbox_messages_site ON inbox_messages(site_id, is_read, sent_at DESC)`;
  console.log("  + inbox_messages indexes");

  // 4. inbox_sync_cursors
  await sql`
    CREATE TABLE IF NOT EXISTS inbox_sync_cursors (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
      content_type TEXT NOT NULL,
      cursor_value TEXT,
      last_synced_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(social_account_id, content_type)
    )
  `;
  console.log("  + inbox_sync_cursors table");

  console.log("\nMigration 014 complete.");
}

migrate().catch((err) => {
  console.error("Migration 014 failed:", err);
  process.exit(1);
});
