/**
 * Migration: wrap legacy avoid declared (free-text string) into the new
 * bool_toggle_overrides shape per [[verbal-domain-decomposition]] LOCKED
 * 2026-06-03.
 *
 * New declared shape on avoid:
 *   {
 *     weasel_words: {
 *       weasel_words_applies: true,           // default on
 *       weasel_words_allow_overrides: [],     // empty initially
 *       legacy_text?: "<old string>"          // preserved for owner reference
 *     }
 *   }
 *
 * NOTE: Catalog input key is "weasel_words" so the editor's value lives at
 * declared.weasel_words. The toggle + allow-list keys nest INSIDE that.
 *
 * Idempotent. Run:
 *   node scripts/migrate-avoid-to-weasel-words-shape.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // Wrap any string declared into the new structure. Preserve the original
    // string under legacy_text for owner reference.
    const stringResult = await c.query(`
      UPDATE brand_descriptor
      SET declared = jsonb_build_object(
            'weasel_words',
            jsonb_build_object(
              'weasel_words_applies', true,
              'weasel_words_allow_overrides', '[]'::jsonb,
              'legacy_text', declared
            )
          ),
          updated_at = now()
      WHERE domain = 'verbal'
        AND key = 'avoid'
        AND declared IS NOT NULL
        AND jsonb_typeof(declared) = 'string'
      RETURNING id, brand_identity_id
    `);
    console.log(`  ✓ avoid string → wrapped shape: ${stringResult.rowCount} row(s)`);
    for (const r of stringResult.rows) {
      console.log(`      ${r.id} (brand_identity ${r.brand_identity_id})`);
    }

    // Any avoid row with NULL declared gets initialized with the default
    // shape so the editor renders consistently.
    const nullResult = await c.query(`
      UPDATE brand_descriptor
      SET declared = jsonb_build_object(
            'weasel_words',
            jsonb_build_object(
              'weasel_words_applies', true,
              'weasel_words_allow_overrides', '[]'::jsonb
            )
          ),
          updated_at = now()
      WHERE domain = 'verbal'
        AND key = 'avoid'
        AND declared IS NULL
      RETURNING id, brand_identity_id
    `);
    console.log(`  ✓ avoid null → default shape: ${nullResult.rowCount} row(s)`);
    for (const r of nullResult.rows) {
      console.log(`      ${r.id} (brand_identity ${r.brand_identity_id})`);
    }

    await c.query("COMMIT");
    console.log("\n  avoid migration complete.");
  } catch (err) {
    await c.query("ROLLBACK");
    console.error("migration failed:", err);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
