/**
 * Recordings — allow typed-input rows (no audio).
 *
 * Per project_tracpost_recording_as_canonical.md (LOCKED 2026-05-10):
 * recordings becomes the sole source for asset narrative. Subscribers
 * who can't speak (or prefer typing) need a first-class capture path
 * that doesn't manufacture audio. Typed entries land as recording rows
 * with storage_url=NULL, mime_type=NULL, transcript=<typed text>,
 * source='typed_briefing', transcribe_provider=NULL.
 *
 * Loosens the NOT NULL constraints on storage_url and mime_type so the
 * same table holds both spoken and typed captures uniformly.
 *
 * Run: node scripts/migrate-108-recordings-typed-input.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Relaxing recordings.storage_url to NULLABLE...");
  await sql`ALTER TABLE recordings ALTER COLUMN storage_url DROP NOT NULL`;
  console.log("  ✓ storage_url is now nullable");

  console.log("Relaxing recordings.mime_type to NULLABLE...");
  await sql`ALTER TABLE recordings ALTER COLUMN mime_type DROP NOT NULL`;
  console.log("  ✓ mime_type is now nullable");

  // Verify
  const cols = await sql`
    SELECT column_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'recordings'
      AND column_name IN ('storage_url', 'mime_type')
    ORDER BY column_name
  `;
  for (const c of cols) {
    console.log(`  ✓ verify: ${c.column_name} is_nullable=${c.is_nullable}`);
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
