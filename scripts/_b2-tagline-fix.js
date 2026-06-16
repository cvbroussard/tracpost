/**
 * Ad-hoc: replace B2's declared tagline with the owner-canonical "Build on."
 * (the analog tagline B2 has been using for years). The current declared
 * value was migrated in with stable_id "legacy" and never updated — an
 * example of an LLM/migration-seeded placeholder drifting into being
 * treated as canonical.
 *
 * Adds a forward-compatibility `owner_canonical: true` flag at the
 * declared root level so future code can distinguish owner-locked values
 * from regeneratable placeholders. No code reads it today; safe to add.
 */
const { Pool, neonConfig } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
try { neonConfig.webSocketConstructor = require("ws"); } catch {}

const TAGLINE_TEXT = "Build on.";

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const c = await pool.connect();
  try {
    const [biz] = (await c.query(`
      SELECT id FROM businesses WHERE name ILIKE '%b2 construction%' LIMIT 1
    `)).rows;
    if (!biz) return console.log("No B2 business found.");
    const [bi] = (await c.query(
      `SELECT id FROM brand_identity WHERE business_id = $1 LIMIT 1`,
      [biz.id],
    )).rows;
    if (!bi) return console.log("No brand_identity row.");

    const [before] = (await c.query(
      `SELECT declared FROM brand_descriptor WHERE brand_identity_id = $1 AND domain = 'verbal' AND key = 'tagline' LIMIT 1`,
      [bi.id],
    )).rows;
    console.log("BEFORE:");
    console.log(JSON.stringify(before?.declared, null, 2));

    const newDeclared = {
      ...(before?.declared || {}),
      owner_canonical: true,
      selected_example: {
        ...((before?.declared?.selected_example) || {}),
        selected_example_id: "owner_canonical",
        selected_example_text: TAGLINE_TEXT,
        selected_example_label: "Owner-declared canonical tagline",
      },
    };

    await c.query(
      `UPDATE brand_descriptor
       SET declared = $1::jsonb,
           updated_at = now()
       WHERE brand_identity_id = $2 AND domain = 'verbal' AND key = 'tagline'`,
      [JSON.stringify(newDeclared), bi.id],
    );

    const [after] = (await c.query(
      `SELECT declared FROM brand_descriptor WHERE brand_identity_id = $1 AND domain = 'verbal' AND key = 'tagline' LIMIT 1`,
      [bi.id],
    )).rows;
    console.log("\nAFTER:");
    console.log(JSON.stringify(after.declared, null, 2));
    console.log("\n✓ Tagline updated to:", TAGLINE_TEXT);
  } finally {
    c.release();
    await pool.end();
  }
})();
