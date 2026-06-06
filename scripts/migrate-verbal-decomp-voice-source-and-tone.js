/**
 * Migration: verbal decomposition catalog migration (Tier 1 of [[verbal-domain-
 * decomposition]] LOCKED 2026-06-03).
 *
 * Two changes:
 *
 *  1. Rename brand_descriptor rows from key='pov_persona' → key='voice_source'.
 *     B Squared's existing pov_persona row is the only one we know of.
 *
 *  2. For tone, wrap any existing string declared value into the new
 *     decomposed shape: `<old_string>` → `{ example: "<old_string>" }`. The
 *     decomposed catalog has inputs[] = [attributes (multi_picker), example
 *     (prose)] — the existing prose maps to the `example` slot. `attributes`
 *     stays empty pending owner pick.
 *
 *  3. Inside business_substrate (kind='public_presence_observation'), rename
 *     the JSONB key `verbal.pov_persona` → `verbal.voice_source` so existing
 *     observations don't orphan their verbal data.
 *
 * Idempotent. Transactional. Run:
 *   node scripts/migrate-verbal-decomp-voice-source-and-tone.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // 1. Rename pov_persona descriptor rows → voice_source.
    const renameResult = await c.query(`
      UPDATE brand_descriptor
      SET key = 'voice_source',
          label = 'Voice source',
          updated_at = now()
      WHERE domain = 'verbal' AND key = 'pov_persona'
      RETURNING id, brand_identity_id, declared
    `);
    console.log(`  ✓ pov_persona → voice_source: renamed ${renameResult.rowCount} row(s)`);
    for (const r of renameResult.rows) {
      console.log(`      ${r.id} (brand_identity ${r.brand_identity_id})`);
    }

    // 2. Wrap string tone.declared into the new decomposed shape.
    // jsonb_typeof checks the existing declared value's JSON type. If it's a
    // string, wrap into { example: <string> }. If it's already an object or
    // null, leave alone (already in new shape or never set).
    const toneResult = await c.query(`
      UPDATE brand_descriptor
      SET declared = jsonb_build_object('example', declared),
          updated_at = now()
      WHERE domain = 'verbal'
        AND key = 'tone'
        AND declared IS NOT NULL
        AND jsonb_typeof(declared) = 'string'
      RETURNING id, brand_identity_id
    `);
    console.log(`  ✓ tone string → { example } shape: wrapped ${toneResult.rowCount} row(s)`);
    for (const r of toneResult.rows) {
      console.log(`      ${r.id} (brand_identity ${r.brand_identity_id})`);
    }

    // 3. Rename verbal.pov_persona key → verbal.voice_source inside the
    //    public_presence_observation substrate payload. JSONB key rename via
    //    merging the new key + dropping the old.
    const substrateResult = await c.query(`
      UPDATE business_substrate
      SET payload = jsonb_set(
            payload #- '{verbal,pov_persona}',
            '{verbal,voice_source}',
            payload->'verbal'->'pov_persona'
          ),
          updated_at = now()
      WHERE kind = 'public_presence_observation'
        AND payload->'verbal' ? 'pov_persona'
      RETURNING id, business_id
    `);
    console.log(`  ✓ substrate verbal.pov_persona → verbal.voice_source: renamed ${substrateResult.rowCount} row(s)`);
    for (const r of substrateResult.rows) {
      console.log(`      ${r.id} (business ${r.business_id})`);
    }

    await c.query("COMMIT");
    console.log("\n  verbal decomp migration complete.");
  } catch (err) {
    await c.query("ROLLBACK");
    console.error("migration failed:", err);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
