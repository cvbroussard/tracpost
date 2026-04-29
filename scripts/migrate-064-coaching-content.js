/**
 * Migration 064: coaching_walkthroughs + coaching_nodes tables.
 *
 * DB-driven content for the per-platform onboarding coaching wizards.
 * Operator can tweak content live by editing rows; no deploy required.
 *
 * coaching_walkthroughs: one row per platform (meta, gbp, linkedin,
 * youtube, pinterest, tiktok, twitter). Holds the modal header info
 * and the entry node id.
 *
 * coaching_nodes: one row per node within a walkthrough. The `content`
 * JSONB field shape varies by `type`:
 *
 *   question:    { question, help?, options: [{ label, next, hint? }] }
 *   instruction: { title, body, deep_link?, deep_link_label?, screenshot?,
 *                  screenshot_alt?, bullets?, next }
 *   terminal:    { title, body, action, action_label? }
 *
 * Initial content seeded via scripts/seed-coaching-{platform}.js,
 * which run after this migration.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

(async () => {
  const sql = neon(process.env.DATABASE_URL);
  console.log("064: coaching_walkthroughs + coaching_nodes...");

  await sql`
    CREATE TABLE IF NOT EXISTS coaching_walkthroughs (
      platform         TEXT PRIMARY KEY,
      title            TEXT NOT NULL,
      subtitle         TEXT,
      estimated_time   TEXT,
      start_node_id    TEXT NOT NULL,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS coaching_nodes (
      platform   TEXT NOT NULL REFERENCES coaching_walkthroughs(platform) ON DELETE CASCADE,
      id         TEXT NOT NULL,
      type       TEXT NOT NULL CHECK (type IN ('question', 'instruction', 'terminal')),
      content    JSONB NOT NULL,
      position   INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (platform, id)
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_coaching_nodes_platform
      ON coaching_nodes(platform, position)
  `;

  console.log("064: done");
})();
