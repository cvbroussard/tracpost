/**
 * Migration 125: asset_analysis JSONB column on media_assets.
 *
 * Holds the canonical Stage 2 multimodal analysis artifact produced
 * by the briefing-complete cascade (per project_tracpost_asset_analysis
 * _cascade memory). Replaces the role that ai_analysis JSONB played
 * for triage's output — but with a NEW schema shape, transcript-
 * grounded, and produced at the right moment (briefing-complete, not
 * upload).
 *
 * Shape:
 *   {
 *     stage1: {
 *       entities: { brands, projects, specialties, locations, materials },
 *       suggested_tags: [...]
 *     },
 *     stage2: {
 *       asset_categories: { primary, secondaries, allRanked },
 *       scene_types: [...],          // salience-ranked, [0] = primary
 *       detected_vendors: [...],     // confidence-ranked
 *       url_slug: string,
 *       story_angles: [...],         // salience-ranked
 *       suggested_pillar: string,
 *       caption_hints: { tone, voice_anchor, key_phrases_to_use, ... }
 *     },
 *     generated_at: ISO8601,
 *     model_versions: { stage1: "claude-haiku-4-5-20251001", stage2: "claude-sonnet-4-6" },
 *     cost_estimate: { stage1_input_tokens, stage1_output_tokens, stage2_input_tokens, stage2_output_tokens }
 *   }
 *
 * Why NEW column vs overloading ai_analysis:
 *   - ai_analysis has a legacy shape (triage's output) that many readers
 *     consume. Changing its shape would break things.
 *   - Clean separation: ai_analysis ages out as readers migrate to
 *     asset_analysis. Once no readers remain, drop ai_analysis.
 *   - asset_analysis has a versioned, structured shape designed around
 *     the cascade architecture from day one.
 *
 * No FK constraints, no indexes — JSONB column is queried by JSON path
 * extraction at read sites (cheap for small cardinality at this stage;
 * add GIN if/when query patterns demand).
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("125: Add media_assets.asset_analysis JSONB column...");

  await sql`
    ALTER TABLE media_assets
    ADD COLUMN IF NOT EXISTS asset_analysis JSONB
  `;
  console.log("  + media_assets.asset_analysis (JSONB, nullable)");

  // GIN index on the JSONB for any-key queries downstream — cheap to
  // add now even if we don't have immediate query patterns. Drop later
  // if unused.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_media_assets_asset_analysis_gin
    ON media_assets USING GIN (asset_analysis jsonb_path_ops)
    WHERE asset_analysis IS NOT NULL
  `;
  console.log("  + idx_media_assets_asset_analysis_gin (jsonb_path_ops, partial)");

  const [col] = await sql`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'media_assets' AND column_name = 'asset_analysis'
  `;
  console.log(`\n  Verified: ${col.column_name} (${col.data_type}, nullable=${col.is_nullable})`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
