/**
 * Migration 128: per-subscriber picker state for upload flows.
 *
 * Persists "last picked" entity per (subscriber, site, picker_kind) so
 * upload pickers default to the subscriber's most recent choice across
 * desktop ↔ mobile and across refresh. Supports the construction
 * workflow where someone captures dozens of photos for a single project
 * over a session: pick once, all subsequent uploads bind.
 *
 * picker_kind:
 *   'project'  — uploads bind to the chosen project (assets_projects)
 *   'persona'  — reserved for future persona path (deferred)
 *
 * entity_id can be NULL to mean "no picker active" (explicit subscriber
 * clear). updated_at lets the UI prefer recent picks; later we can
 * expire stale ones if needed.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("128: Creating subscriber_pickers table...");
  await sql`
    CREATE TABLE IF NOT EXISTS subscriber_pickers (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      picker_kind TEXT NOT NULL,
      entity_id UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, site_id, picker_kind)
    )
  `;
  console.log("  + subscriber_pickers");

  // Allowed kinds — CHECK lets us extend later without breaking existing rows.
  await sql`
    ALTER TABLE subscriber_pickers
    DROP CONSTRAINT IF EXISTS subscriber_pickers_kind_check
  `;
  await sql`
    ALTER TABLE subscriber_pickers
    ADD CONSTRAINT subscriber_pickers_kind_check
    CHECK (picker_kind IN ('project', 'persona'))
  `;
  console.log("  + kind constraint");

  // Verify
  const rows = await sql`SELECT COUNT(*)::int AS n FROM subscriber_pickers`;
  console.log(`\n  subscriber_pickers row count: ${rows[0].n}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
