/**
 * Migration 139: strategic_recommendations table.
 *
 * Persists the output of the Statistical Recommendation Engine
 * (src/lib/brand-identity/statistical-recommendation.ts) — the unified
 * brand identity Statistical bundle (Offer / Audience / Positioning /
 * Hooks / Tagline / CTA) derived from a specific CMA snapshot.
 *
 * Sister table to competitive_market_analyses (migration 121). Where
 * competitive_market_analyses stores the TACTICAL recommendation layer
 * (review velocity, category gaps, geographic gaps) inline in
 * analysis_data.recommendations, THIS table stores the STRATEGIC
 * recommendation bundle as a top-level artifact with its own lifecycle.
 *
 * Schema rationale:
 *   - One row per generation event. Multiple rows per (business_id) are
 *     expected — refinements, retries, comparisons. cma_id FKs back to
 *     the snapshot that produced this strategic recommendation so
 *     staleness can be detected (e.g., "CMA refreshed; regenerate").
 *   - prompt_version + system_prompt + user_message + raw_response
 *     persisted verbatim per [[persist-prompts-with-outputs]]. Without
 *     it, prompt iteration is vibes-based.
 *   - parsed_bundle JSONB holds the typed StatisticalBundle so the UI
 *     reads one column instead of re-parsing raw_response.
 *   - owner_action tracks the bundle's lifecycle through review:
 *       pending  → just generated, awaiting owner review
 *       approved → owner approved the bundle atomically (written to
 *                  brand_identity declared fields)
 *       refined  → owner approved an edited version (parsed_bundle
 *                  diverged from raw_response)
 *       rejected → owner discarded the bundle
 *   - Token counts persisted for cost analysis + LLM-cost dashboards.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("139: Create strategic_recommendations table...");

  await sql`
    CREATE TABLE IF NOT EXISTS strategic_recommendations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      brand_identity_id UUID NOT NULL REFERENCES brand_identity(id) ON DELETE CASCADE,
      cma_id UUID NOT NULL REFERENCES competitive_market_analyses(id) ON DELETE RESTRICT,
      prompt_version TEXT NOT NULL,
      system_prompt TEXT NOT NULL,
      user_message TEXT NOT NULL,
      model TEXT NOT NULL,
      raw_response TEXT NOT NULL,
      parsed_bundle JSONB NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      owner_action TEXT NOT NULL DEFAULT 'pending'
        CHECK (owner_action IN ('pending', 'approved', 'refined', 'rejected')),
      owner_action_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("  + strategic_recommendations");

  // Latest-bundle-per-business lookup (review screen reads most recent
  // pending, or most recent approved for already-confirmed strategy)
  await sql`
    CREATE INDEX IF NOT EXISTS idx_strategic_rec_business_created
    ON strategic_recommendations (business_id, created_at DESC)
  `;
  console.log("  + idx_strategic_rec_business_created (latest-per-business)");

  // Find bundles derived from a specific CMA snapshot — for staleness
  // detection ("CMA refreshed since this strategic rec; offer regen")
  await sql`
    CREATE INDEX IF NOT EXISTS idx_strategic_rec_cma
    ON strategic_recommendations (cma_id)
  `;
  console.log("  + idx_strategic_rec_cma (staleness checks)");

  // Pending bundles awaiting owner action — partial index for the
  // review queue
  await sql`
    CREATE INDEX IF NOT EXISTS idx_strategic_rec_pending
    ON strategic_recommendations (business_id, created_at DESC)
    WHERE owner_action = 'pending'
  `;
  console.log("  + idx_strategic_rec_pending (review-queue lookups)");

  const cols = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'strategic_recommendations'
    ORDER BY ordinal_position
  `;
  console.log("\n  Verified columns:");
  cols.forEach((c) =>
    console.log(
      `    ${c.column_name.padEnd(22)} ${c.data_type.padEnd(28)} ${c.is_nullable === "YES" ? "null" : "not null"}`,
    ),
  );

  const constraints = await sql`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'strategic_recommendations'::regclass
    ORDER BY conname
  `;
  console.log("\n  Constraints:");
  constraints.forEach((c) => console.log(`    ${c.conname}`));
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
