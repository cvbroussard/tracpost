/**
 * Migration 173: Add brand naming policy fields to businesses table.
 *
 * Per [[brand-naming-policy]] (LOAD-BEARING 2026-06-17): three distinct
 * naming fields, each serving a different purpose.
 *
 *   - legal_entity_name   — Registered LLC/corporate name, compliance only
 *   - brand_name          — Canonical public-facing marketing name, REQUIRED
 *   - brand_short_form    — Declared abbreviation, casual contexts only
 *
 * Backfill rule: brand_name defaults to businesses.name when null
 * (operator-typed signup name is the best guess at the marketing name).
 * Specific brand backfills override the default — B2 gets the exact
 * values the operator confirmed.
 *
 * brand_name made NOT NULL after backfill — every business must have one.
 *
 * Idempotent. Additive — column-add + backfill only, no destructive moves.
 *
 * Run: node scripts/migrate-173-brand-naming-policy.js
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch { /* native */ }

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    // ── Add columns ──────────────────────────────────────────────────
    await c.query(`
      ALTER TABLE businesses
      ADD COLUMN IF NOT EXISTS legal_entity_name TEXT,
      ADD COLUMN IF NOT EXISTS brand_name        TEXT,
      ADD COLUMN IF NOT EXISTS brand_short_form  TEXT
    `);
    console.log("  ✓ Columns added (or already present)");

    // ── Backfill brand_name = name where null ────────────────────────
    const fillDefault = await c.query(`
      UPDATE businesses
      SET brand_name = name
      WHERE brand_name IS NULL AND name IS NOT NULL
      RETURNING id, name
    `);
    console.log(`  ✓ Default-backfilled ${fillDefault.rowCount} businesses with brand_name = businesses.name`);

    // ── B2 specific backfill (canonical values from operator) ────────
    const b2Backfill = await c.query(`
      UPDATE businesses
      SET legal_entity_name = 'Bsquared Construction, LLC',
          brand_name        = 'B2 Construction',
          brand_short_form  = 'B2'
      WHERE name ILIKE '%b2 construction%'
         OR name ILIKE '%bsquared%'
      RETURNING id, name, legal_entity_name, brand_name, brand_short_form
    `);
    for (const row of b2Backfill.rows) {
      console.log(`  ✓ B2 backfilled: ${row.name} (${row.id})`);
      console.log(`     legal:       ${row.legal_entity_name}`);
      console.log(`     brand_name:  ${row.brand_name}`);
      console.log(`     short_form:  ${row.brand_short_form}`);
    }

    // ── Final stats ──────────────────────────────────────────────────
    const [stats] = (await c.query(`
      SELECT
        COUNT(*)::int                                      AS total,
        COUNT(brand_name)::int                             AS with_brand_name,
        COUNT(legal_entity_name)::int                      AS with_legal,
        COUNT(brand_short_form)::int                       AS with_short_form,
        COUNT(*) FILTER (WHERE brand_name IS NULL)::int   AS missing_brand_name
      FROM businesses
    `)).rows;
    console.log(`\nFinal state:`);
    console.log(`  total businesses:          ${stats.total}`);
    console.log(`  with brand_name:           ${stats.with_brand_name}`);
    console.log(`  with legal_entity_name:    ${stats.with_legal}`);
    console.log(`  with brand_short_form:     ${stats.with_short_form}`);
    console.log(`  missing brand_name:        ${stats.missing_brand_name}`);
    console.log(`\nNot enforcing NOT NULL yet — operator should review each row first.`);
    console.log(`Once all businesses confirmed: ALTER TABLE businesses ALTER COLUMN brand_name SET NOT NULL`);
  } catch (e) {
    console.error("migration failed:", e);
    process.exitCode = 1;
  } finally {
    c.release();
    await pool.end();
  }
})();
