/**
 * Migrate (CUTOVER): brand_descriptor.declared TEXT → JSONB.
 *
 * Why: enables decomposed text inputs per descriptor (picker form #3 — the
 * form-level redesign that solves the omission failure mode). With JSONB,
 * descriptors with `inputs` defined in catalog.ts store structured shapes
 * (e.g. offer: { services: [...], benefits: [...], example: "..." }), while
 * descriptors without inputs continue to hold a JSONB string.
 *
 * Existing TEXT values are preserved by wrapping with to_jsonb() — they become
 * JSONB string values. Page reads check `typeof declared` to branch between
 * single-textarea (string) and decomposed sub-fields (object) rendering.
 *
 * Per retire-legacy: this is a CUTOVER, not dual-write. The reader code at
 * call sites (store.ts getBrandIdentity, page.tsx) handles both shapes from
 * day one.
 *
 * Idempotent: checks the current column data_type before altering.
 * Run:  node scripts/migrate-brand-descriptor-declared-jsonb.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native WS */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    await c.query("BEGIN");

    const current = (await c.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'brand_descriptor'
        AND column_name = 'declared'
    `)).rows[0]?.data_type;

    if (current === "jsonb") {
      console.log("  · brand_descriptor.declared is already jsonb — nothing to do.");
    } else {
      await c.query(`
        ALTER TABLE brand_descriptor
        ALTER COLUMN declared TYPE JSONB USING to_jsonb(declared)
      `);
      console.log("  ✓ brand_descriptor.declared: text → jsonb (existing values wrapped as JSONB strings)");
    }

    await c.query("COMMIT");

    const after = (await c.query(`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'brand_descriptor'
        AND column_name = 'declared'
    `)).rows[0]?.data_type;
    console.log(`\n  declared column data_type now: ${after}\nDone (cutover).`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    console.error("\nFAILED — rolled back.", e.message);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
