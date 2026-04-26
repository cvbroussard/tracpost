/**
 * Migration 054: Engage module schema.
 *
 * Four tables for the engagement-based relationship engine:
 *   engaged_persons          — one row per unique person per subscriber
 *   engaged_person_handles   — platform identities for that person
 *   engagement_events        — raw activity log (comments, mentions, reviews, etc.)
 *   engagement_capture_runs  — operational log for the capture pipeline
 *
 * No follower lists involved. The relationship database builds itself
 * from people who actively engage with the subscriber's content.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  console.log("054: Engage module schema...");

  await sql`
    CREATE TABLE IF NOT EXISTS engaged_persons (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_id          UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      display_name             TEXT NOT NULL,
      first_seen_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      engagement_count         INTEGER NOT NULL DEFAULT 0,
      positive_engagements     INTEGER NOT NULL DEFAULT 0,
      negative_engagements     INTEGER NOT NULL DEFAULT 0,
      is_advocate              BOOLEAN NOT NULL DEFAULT false,
      is_influencer            BOOLEAN NOT NULL DEFAULT false,
      is_customer              BOOLEAN NOT NULL DEFAULT false,
      tags                     TEXT[] NOT NULL DEFAULT '{}',
      notes                    TEXT,
      metadata                 JSONB NOT NULL DEFAULT '{}',
      created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  + engaged_persons");

  await sql`CREATE INDEX IF NOT EXISTS idx_engaged_persons_subscriber ON engaged_persons(subscription_id, last_seen_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_engaged_persons_advocates ON engaged_persons(subscription_id) WHERE is_advocate = true`;

  await sql`
    CREATE TABLE IF NOT EXISTS engaged_person_handles (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      engaged_person_id   UUID NOT NULL REFERENCES engaged_persons(id) ON DELETE CASCADE,
      platform            TEXT NOT NULL,
      platform_user_id    TEXT NOT NULL,
      handle              TEXT,
      profile_url         TEXT,
      avatar_url          TEXT,
      follower_count      INTEGER,
      link_confidence     NUMERIC(3,2) NOT NULL DEFAULT 1.0,
      first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata            JSONB NOT NULL DEFAULT '{}',
      UNIQUE (platform, platform_user_id)
    )
  `;
  console.log("  + engaged_person_handles");

  await sql`CREATE INDEX IF NOT EXISTS idx_handles_person ON engaged_person_handles(engaged_person_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS engagement_events (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_id       UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      site_id               UUID REFERENCES sites(id) ON DELETE SET NULL,
      platform_asset_id     UUID REFERENCES platform_assets(id) ON DELETE SET NULL,
      engaged_person_id     UUID REFERENCES engaged_persons(id) ON DELETE SET NULL,
      platform              TEXT NOT NULL,
      event_type            TEXT NOT NULL,
      target_type           TEXT,
      platform_target_id    TEXT,
      source_post_id        UUID REFERENCES social_posts(id),
      body                  TEXT,
      sentiment             TEXT,
      sentiment_score       NUMERIC(3,2),
      permalink             TEXT,
      occurred_at           TIMESTAMPTZ NOT NULL,
      discovered_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      review_status         TEXT NOT NULL DEFAULT 'new',
      response_event_id     UUID REFERENCES engagement_events(id),
      metadata              JSONB NOT NULL DEFAULT '{}',
      UNIQUE (platform, platform_target_id, event_type)
    )
  `;
  console.log("  + engagement_events");

  await sql`CREATE INDEX IF NOT EXISTS idx_events_subscriber_time ON engagement_events(subscription_id, occurred_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_review_status ON engagement_events(subscription_id, review_status) WHERE review_status = 'new'`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_person ON engagement_events(engaged_person_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_site_time ON engagement_events(site_id, occurred_at DESC)`;

  await sql`
    CREATE TABLE IF NOT EXISTS engagement_capture_runs (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      platform_asset_id     UUID NOT NULL REFERENCES platform_assets(id) ON DELETE CASCADE,
      capture_type          TEXT NOT NULL,
      ran_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      cursor_used           TEXT,
      cursor_returned       TEXT,
      events_captured       INTEGER NOT NULL DEFAULT 0,
      events_new            INTEGER NOT NULL DEFAULT 0,
      duration_ms           INTEGER,
      error                 TEXT
    )
  `;
  console.log("  + engagement_capture_runs");

  await sql`CREATE INDEX IF NOT EXISTS idx_capture_runs_asset_time ON engagement_capture_runs(platform_asset_id, ran_at DESC)`;

  console.log("Done.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
