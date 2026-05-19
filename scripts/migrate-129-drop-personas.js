/**
 * Migration 129: Drop the personas entity.
 *
 * Personas were retired from the cascade 2026-05-19. Per the privacy
 * discussion: identity attribution lives in the transcript verbatim;
 * face detection (if/when re-introduced) serves blanket privacy
 * handling, NOT identification. There's no architectural place for a
 * structured persona entity anymore.
 *
 * Tables to drop:
 *   - asset_personas       (join: asset ↔ persona)
 *   - personas             (entity catalog)
 *
 * Column to drop:
 *   - recordings.speaker_persona_id  (was tied to personas FK)
 *
 * Constraint update:
 *   - subscriber_pickers picker_kind CHECK drops the 'persona' value
 *     (only 'project' remains; persona path never shipped)
 *
 * Legacy data: 18 asset_personas rows + a handful of persona records
 * across B² + EK. All considered noise per the 2026-05-19 decision.
 * Single CASCADE drop wipes everything cleanly.
 *
 * No backfill, no preservation. The audio + transcript that mentioned
 * those names is preserved (recordings table is untouched); identity
 * attribution can be reconstructed from there if ever needed.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("129: Dropping personas entity...");

  // Pre-flight counts (informational)
  const [{ asset_personas_count }] = await sql`
    SELECT COUNT(*)::int AS asset_personas_count FROM asset_personas
  `;
  const [{ personas_count }] = await sql`
    SELECT COUNT(*)::int AS personas_count FROM personas
  `;
  const [{ recordings_with_persona }] = await sql`
    SELECT COUNT(*)::int AS recordings_with_persona
    FROM recordings WHERE speaker_persona_id IS NOT NULL
  `;
  console.log(`  asset_personas rows being dropped:       ${asset_personas_count}`);
  console.log(`  personas rows being dropped:             ${personas_count}`);
  console.log(`  recordings.speaker_persona_id non-null:  ${recordings_with_persona}`);

  // Drop join table first (FK to personas)
  await sql`DROP TABLE IF EXISTS asset_personas CASCADE`;
  console.log("  - asset_personas table dropped");

  // Drop the recordings FK column (depends on personas)
  await sql`ALTER TABLE recordings DROP COLUMN IF EXISTS speaker_persona_id`;
  console.log("  - recordings.speaker_persona_id column dropped");

  // Drop the personas catalog table
  await sql`DROP TABLE IF EXISTS personas CASCADE`;
  console.log("  - personas table dropped");

  // Update subscriber_pickers CHECK constraint — 'persona' was reserved
  // for a future picker path that never shipped. Now picker_kind is
  // 'project' only.
  await sql`
    ALTER TABLE subscriber_pickers
    DROP CONSTRAINT IF EXISTS subscriber_pickers_kind_check
  `;
  await sql`
    ALTER TABLE subscriber_pickers
    ADD CONSTRAINT subscriber_pickers_kind_check
    CHECK (picker_kind IN ('project'))
  `;
  console.log("  - subscriber_pickers kind constraint narrowed to 'project'");

  // Verify
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('personas', 'asset_personas')
  `;
  console.log(`\n  Verified: personas tables remaining = ${tables.length} (should be 0)`);

  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'recordings' AND column_name = 'speaker_persona_id'
  `;
  console.log(`  Verified: recordings.speaker_persona_id columns = ${cols.length} (should be 0)`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
