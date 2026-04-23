/**
 * Migration 050: Convert products.features from TEXT[] to JSONB array of objects.
 * Each feature becomes { text: "...", visible: true }
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  console.log("050: Convert features to JSONB...");

  // Add new column
  await sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS features_json JSONB DEFAULT '[]'::jsonb`;

  // Migrate data: convert TEXT[] to JSONB array of {text, visible}
  const products = await sql`SELECT id, features FROM products`;
  for (const p of products) {
    const features = (p.features || []).map(f => ({ text: f, visible: true }));
    await sql`UPDATE products SET features_json = ${JSON.stringify(features)} WHERE id = ${p.id}`;
    console.log(`  migrated: ${p.id} (${features.length} features)`);
  }

  // Drop old column, rename new
  await sql`ALTER TABLE products DROP COLUMN features`;
  await sql`ALTER TABLE products RENAME COLUMN features_json TO features`;
  console.log("  + features column now JSONB");

  console.log("\n050: Done.");
}

migrate().catch((err) => { console.error(err); process.exit(1); });
