/**
 * Migration 034: page_config + work_content for variant-driven rendering.
 *
 * Two new columns on sites:
 *
 *   page_config JSONB — array of six slot objects. Defines per-tenant
 *     enable/disable, label overrides, URL path, and active variant
 *     per slot. Structure:
 *       [
 *         { id: 1, key: "home",     enabled: true, label: "Home",        path: "",             variant: "service_business" },
 *         { id: 2, key: "about",    enabled: true, label: "About",       path: "about",        variant: "solo_practitioner" },
 *         { id: 3, key: "work",     enabled: true, label: "Services",    path: "services",     variant: "services_tiles" },
 *         { id: 4, key: "blog",     enabled: true, label: "Blog",        path: "blog",         variant: "journal" },
 *         { id: 5, key: "projects", enabled: true, label: "Projects",    path: "projects",     variant: "portfolio" },
 *         { id: 6, key: "contact",  enabled: true, label: "Contact",     path: "contact",      variant: "form" }
 *       ]
 *
 *   work_content JSONB — variant-keyed content for the Work slot (id:3).
 *     Preserves both services_tiles and pricing_tiers data so admin can
 *     switch variants without losing data. Structure:
 *       {
 *         variant: "services_tiles",
 *         headline: "What We Do",
 *         subheadline: "Our approach…",
 *         services_tiles: [...],
 *         pricing_tiers: [...]
 *       }
 *
 * Both columns are nullable. Tenants with NULL page_config get the
 * default config from application code (six slots all enabled with
 * default labels/paths/variants). No backfill in this migration; the
 * seed script handles that per-tenant.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("034: page_config + work_content columns on sites…");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS page_config JSONB`;
  console.log("  + sites.page_config (JSONB)");

  await sql`ALTER TABLE sites ADD COLUMN IF NOT EXISTS work_content JSONB`;
  console.log("  + sites.work_content (JSONB)");

  // Verify
  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'sites' AND column_name IN ('page_config', 'work_content')
    ORDER BY column_name
  `;
  console.log("\nVerification:");
  for (const c of cols) {
    console.log(`  ${c.column_name.padEnd(20)} ${c.data_type}`);
  }

  console.log("\n034: Done.");
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
