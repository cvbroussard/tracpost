/**
 * Migration 123: commercial_tiers + sites.commercial_tier_id.
 *
 * Implements the bedrock tier model (per project_tracpost_tier_model.md):
 * subscriber selects their site's tier from a 3-option picker (TracPost's
 * target zone); the CMA classifies SERP competitors across a broader
 * 7-tier structural taxonomy and filters analysis to in-tier peers.
 *
 * Schema rationale:
 *   - One row per canonical tier; slug is stable identifier used in code
 *   - is_target distinguishes picker-visible tiers from CMA-only
 *     classification tiers (subscribers never see "below_target")
 *   - description carries the picker copy AND the LLM classification
 *     guidance (single source of truth for what each tier means)
 *   - display_order controls picker rendering sequence
 *   - sites.commercial_tier_id is nullable — pre-existing sites stay
 *     unset until subscriber/operator assigns; CMA degrades gracefully
 *     (un-tiered sites get a CMA that doesn't filter by tier)
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const TIERS = [
  // ----- Target tiers (shown in picker) -----
  {
    slug: "small_crew",
    label: "Small established crew",
    is_target: true,
    display_order: 10,
    description:
      "~5-10 people, growing city/regional presence, ready to invest in visibility infrastructure. " +
      "Mix of referral and walk-up work; reputation locally known but not yet dominant. " +
      "Growing toward the mid-size sweet spot.",
  },
  {
    slug: "mid_size_operator",
    label: "Mid-size operator",
    is_target: true,
    display_order: 20,
    description:
      "10-30 people, regional presence, established reputation, mix of referral and search-driven leads. " +
      "Recognized in their market. The tier where moderate-quality SEO discipline determines who shows " +
      "up first. TracPost is built primarily for this tier.",
  },
  {
    slug: "boutique_specialty",
    label: "Boutique specialty",
    is_target: true,
    display_order: 30,
    description:
      "Smaller team but premium positioning, design-led or niche clientele, often architect-referred. " +
      "Competes on aesthetic, prestige, and relationships rather than raw visibility. Benefits from " +
      "sophisticated organic presence aligned to a discerning audience.",
  },
  // ----- Non-target tiers (CMA classification only) -----
  {
    slug: "below_target",
    label: "Below target tier",
    is_target: false,
    display_order: 100,
    description:
      "Smaller than the target tier — sole operators, handymen, mom-and-pop crews of 2-5 people, " +
      "single-truck operations. Hyperlocal or city-scale only. Below the threshold for established small crew.",
  },
  {
    slug: "above_target",
    label: "Above target tier",
    is_target: false,
    display_order: 110,
    description:
      "Larger than the target tier — scale operators (30+ people), multi-regional chains, " +
      "production builders, enterprises with in-house marketing. Different competitive dynamics " +
      "than mid-size; usually competing on volume and brand recognition rather than craftsmanship.",
  },
  {
    slug: "specialty_trade",
    label: "Specialty trade",
    is_target: false,
    display_order: 120,
    description:
      "Single-trade specialist — drywall-only, tile-only, roofing-only, painting-only, plastering-only. " +
      "Narrow service scope vs full-service general contractor. Often functions as subcontractor to " +
      "the target tier rather than direct competitor.",
  },
  {
    slug: "out_of_category",
    label: "Out of category",
    is_target: false,
    display_order: 130,
    description:
      "Not actually in this industry. Surfaces on the SERP through query overlap (e.g., an entertainment " +
      "business named with a painting keyword, a retail store sharing a category term). Strong evidence " +
      "that the SERP rewards consistent presence over operational fit — not a true competitor.",
  },
];

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("123: Create commercial_tiers table...");
  await sql`
    CREATE TABLE IF NOT EXISTS commercial_tiers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      is_target BOOLEAN NOT NULL DEFAULT false,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  + commercial_tiers");

  console.log("\n  Seed canonical tiers...");
  for (const t of TIERS) {
    const r = await sql`
      INSERT INTO commercial_tiers (slug, label, description, is_target, display_order)
      VALUES (${t.slug}, ${t.label}, ${t.description}, ${t.is_target}, ${t.display_order})
      ON CONFLICT (slug) DO UPDATE SET
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_target = EXCLUDED.is_target,
        display_order = EXCLUDED.display_order
      RETURNING slug, is_target
    `;
    console.log(`    ${r[0].is_target ? "● " : "  "} ${r[0].slug}`);
  }

  console.log("\n  Add sites.commercial_tier_id...");
  await sql`
    ALTER TABLE sites
    ADD COLUMN IF NOT EXISTS commercial_tier_id UUID REFERENCES commercial_tiers(id) ON DELETE SET NULL
  `;
  console.log("  + sites.commercial_tier_id (nullable FK)");

  const cols = await sql`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'commercial_tiers'
    ORDER BY ordinal_position
  `;
  console.log("\n  Verified commercial_tiers columns:");
  cols.forEach((c) => console.log(`    ${c.column_name.padEnd(15)} ${c.data_type}`));

  const counts = await sql`
    SELECT
      COUNT(*) FILTER (WHERE is_target) as targets,
      COUNT(*) FILTER (WHERE NOT is_target) as non_targets
    FROM commercial_tiers
  `;
  console.log(`\n  Seeded: ${counts[0].targets} target tiers + ${counts[0].non_targets} CMA-only tiers`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
