/**
 * Migration 063: coaching_progress table.
 *
 * Tracks each subscription's progress through the per-platform coaching
 * walkthrough decision trees. One row per (subscription, platform).
 * Updated as the user navigates through nodes; completion sets
 * completed_at; closing the modal mid-way does not abandon (user can
 * resume next time).
 *
 * path_taken records every node id the user has visited in order. Useful
 * for analytics: which questions cause most abandonment, which paths
 * complete fastest, where users get stuck.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  console.log("063: coaching_progress table...");

  await sql`
    CREATE TABLE IF NOT EXISTS coaching_progress (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subscription_id    UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
      platform           TEXT NOT NULL,
      last_node_id       TEXT NOT NULL,
      path_taken         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
      reached_terminal   BOOLEAN NOT NULL DEFAULT false,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at       TIMESTAMPTZ,
      UNIQUE (subscription_id, platform)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_coaching_progress_subscription
      ON coaching_progress(subscription_id)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_coaching_progress_platform_complete
      ON coaching_progress(platform, completed_at)
      WHERE completed_at IS NOT NULL
  `;

  console.log("063: done");
})();
