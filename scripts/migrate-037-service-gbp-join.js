/**
 * Migration 037: service_gbp_categories join table.
 *
 * Anchors each service to one or more GBP categories. No ad-hoc
 * services — every service must map to at least one gcid. The join
 * table enables cross-tenant analytics ("which services do gcid:X
 * tenants offer") and supports services that span multiple
 * categories (e.g. "Full Home Renovation" → contractor + remodeler).
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("037: Adding service_gbp_categories join table...");

  await sql`
    CREATE TABLE IF NOT EXISTS service_gbp_categories (
      service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      gcid TEXT NOT NULL REFERENCES gbp_categories(gcid) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (service_id, gcid)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_service_gbp_service ON service_gbp_categories(service_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_service_gbp_gcid ON service_gbp_categories(gcid)`;
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_service_gbp_primary
    ON service_gbp_categories(service_id) WHERE is_primary
  `;

  console.log("  + service_gbp_categories");

  const tables = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'service_gbp_categories'
    ORDER BY ordinal_position
  `;
  console.log("\nVerification:");
  for (const c of tables) {
    console.log(`  ${c.column_name.padEnd(20)} ${c.data_type}`);
  }

  console.log("\n037: Done.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
