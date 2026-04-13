/**
 * One-off: prep the TracPost-as-tenant `sites` row for provisioning.
 *
 * Usage: node scripts/onboard-tracpost-tenant.js <site_id>
 *
 * Sets the fields the bare admin "Add Site" form doesn't collect:
 *   business_type, location, url (canonical), blog_slug='tracpost',
 *   provisioning_status='requested'
 *
 * After running this, go to /admin/provisioning and click "Start
 * Provisioning" — the existing curtain fires the playbook generator,
 * enables blog_settings, derives theme, and seeds nav links.
 *
 * Idempotent — safe to re-run.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const siteId = process.argv[2];
  if (!siteId) {
    console.error("Usage: node scripts/onboard-tracpost-tenant.js <site_id>");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  // Sanity check
  const [existing] = await sql`
    SELECT id, name, blog_slug, business_type, provisioning_status
    FROM sites WHERE id = ${siteId}
  `;
  if (!existing) {
    console.error(`Site ${siteId} not found`);
    process.exit(1);
  }

  console.log("Before:");
  console.log(`  name              = ${existing.name}`);
  console.log(`  blog_slug         = ${existing.blog_slug ?? "(null)"}`);
  console.log(`  business_type     = ${existing.business_type ?? "(null)"}`);
  console.log(`  provisioning      = ${existing.provisioning_status ?? "(null)"}`);

  // Confirm uniqueness — no other site can hold blog_slug='tracpost'
  const collisions = await sql`
    SELECT id, name FROM sites
    WHERE blog_slug = 'tracpost' AND id != ${siteId}
  `;
  if (collisions.length > 0) {
    console.error(`\nAnother site already holds blog_slug='tracpost':`);
    for (const c of collisions) console.error(`  ${c.id}  ${c.name}`);
    process.exit(1);
  }

  await sql`
    UPDATE sites SET
      business_type = COALESCE(business_type, 'Content automation platform'),
      url = COALESCE(url, 'https://tracpost.com'),
      blog_slug = 'tracpost',
      provisioning_status = COALESCE(provisioning_status, 'requested'),
      updated_at = NOW()
    WHERE id = ${siteId}
  `;

  const [after] = await sql`
    SELECT name, blog_slug, business_type, url, provisioning_status
    FROM sites WHERE id = ${siteId}
  `;

  console.log("\nAfter:");
  console.log(`  name              = ${after.name}`);
  console.log(`  blog_slug         = ${after.blog_slug}`);
  console.log(`  business_type     = ${after.business_type}`);
  console.log(`  url               = ${after.url}`);
  console.log(`  provisioning      = ${after.provisioning_status}`);

  console.log("\nDone. Next: open /admin/provisioning and click 'Start Provisioning'");
  console.log("for the TracPost row to fire the curtain (playbook + blog + theme + nav).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
