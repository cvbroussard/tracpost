/**
 * Migration 140: canonical brand basics on businesses.
 *
 * Adds three first-class columns to the businesses table for canonical
 * brand-level facts that previously had no home:
 *
 *   - founder_name     TEXT     — owner / founder display name
 *   - founding_year    INTEGER  — schema.org foundingDate (year only)
 *   - origin_context   TEXT     — one-paragraph "why this business exists"
 *
 * Why on businesses (not brand_identity):
 *   These are facts about the legal/operational entity, not the brand
 *   expression. Schema.org JSON-LD wants them on the business; multi-brand
 *   businesses (deferred per memory) would share them; they predate brand
 *   identity setup. Per the canonical-place lock — single source, every
 *   surface reads.
 *
 * Consumers (current + planned):
 *   - Strategic Recommendation engine (BrandBasics input)
 *   - Eventual schema.org JSON-LD generator (founder, foundingDate)
 *   - Copywriter agency-role LLM (trust signals, "since YYYY" copy)
 *   - About-page copy generator
 *
 * All three are NULLABLE — soft prereqs, not blocking. Owner can skip
 * during onboarding; ops can backfill later. CMA + strategic engine still
 * run without them (with weaker context).
 *
 * No data backfill: existing rows get NULLs. Owners who skip in
 * onboarding get prompted later in the brand-identity surface.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("140: Add brand basics columns to businesses...");

  await sql`
    ALTER TABLE businesses
      ADD COLUMN IF NOT EXISTS founder_name TEXT,
      ADD COLUMN IF NOT EXISTS founding_year INTEGER,
      ADD COLUMN IF NOT EXISTS origin_context TEXT
  `;
  console.log("  + founder_name, founding_year, origin_context");

  // Sanity check on founding_year — must be a plausible year or NULL.
  // Don't constrain to a max (future-dated businesses are pathological
  // but not impossible; let validation happen at the app layer).
  const hasYearCheck = (await sql`
    SELECT 1 FROM pg_constraint WHERE conname = 'businesses_founding_year_check'
  `).length > 0;
  if (!hasYearCheck) {
    await sql`
      ALTER TABLE businesses
      ADD CONSTRAINT businesses_founding_year_check
      CHECK (founding_year IS NULL OR founding_year BETWEEN 1700 AND 2200)
    `;
    console.log("  + businesses_founding_year_check (1700..2200 or null)");
  }

  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'businesses' AND column_name IN
      ('founder_name', 'founding_year', 'origin_context')
    ORDER BY column_name
  `;
  console.log("\n  Verified columns:");
  cols.forEach((c) =>
    console.log(
      `    ${c.column_name.padEnd(22)} ${c.data_type.padEnd(10)} ${c.is_nullable === "YES" ? "null" : "not null"}`,
    ),
  );
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
