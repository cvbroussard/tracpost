/**
 * Migration: tagline decomposition catalog migration (2026-06-07).
 *
 * Wrap legacy tagline.declared (single textarea string) into the new
 * example_set_picker shape used by the inputs[]=[selected_example] decomposition:
 *
 *   "<old_string>"
 *     →
 *   { selected_example: {
 *       selected_example_id:    "legacy",
 *       selected_example_text:  "<old_string>",
 *       selected_example_label: "legacy declaration",
 *       selected_example_reference_images: null,
 *       generated_from_inputs_hash: null
 *     } }
 *
 * Owners with a legacy declaration see it in the picker as a "legacy declaration"
 * entry, can keep it, or generate fresh candidates and pick from those.
 *
 * Idempotent. Transactional. Run:
 *   node scripts/migrate-tagline-decomp-picker-shape.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    // Wrap any string-typed tagline.declared into the picker shape.
    // jsonb_typeof checks the existing declared value's JSON type. If it's a
    // string, wrap. Empty strings are also wrapped (and visible as "legacy
    // declaration" with empty text — owner can clear or regenerate).
    const wrap = await c.query(`
      UPDATE brand_descriptor
      SET declared = jsonb_build_object(
            'selected_example', jsonb_build_object(
              'selected_example_id', 'legacy',
              'selected_example_text', declared,
              'selected_example_label', 'legacy declaration',
              'selected_example_reference_images', null,
              'generated_from_inputs_hash', null
            )
          ),
          updated_at = now()
      WHERE domain = 'verbal'
        AND key = 'tagline'
        AND declared IS NOT NULL
        AND jsonb_typeof(declared) = 'string'
      RETURNING id, brand_identity_id, declared
    `);
    console.log(`  ✓ tagline string → picker shape: wrapped ${wrap.rowCount} row(s)`);
    for (const r of wrap.rows) {
      const txt = r.declared?.selected_example?.selected_example_text ?? "(empty)";
      console.log(`      ${r.id} (brand_identity ${r.brand_identity_id}) — "${txt}"`);
    }

    await c.query("COMMIT");
    console.log("\n✅ tagline picker-shape migration complete");
  } catch (e) {
    await c.query("ROLLBACK");
    console.error("\n❌ migration failed:", e);
    process.exit(1);
  } finally {
    c.release();
    await pool.end();
  }
})();
