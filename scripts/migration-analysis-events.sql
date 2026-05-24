-- Migration: analysis_events
--
-- Append-only history of every cascade-analyze LLM call.
-- Each cascade-commit run writes TWO rows: one for the NER (Haiku) call,
-- one for the Vision (Sonnet) call. The existing media_assets.ai_analysis
-- jsonb remains as the denormalized "latest" cache for read performance.
--
-- This closes the gap where re-analyses overwrite each other in ai_analysis
-- with no history — making A/B prompt comparison impossible. Mirrors the
-- production_events pattern that the video-gen Director/Producer pipeline
-- already uses for the same provenance need.
--
-- Apply manually via psql (or your usual schema-change path) BEFORE
-- deploying the cascade-commit code change that writes to this table.

CREATE TABLE IF NOT EXISTS analysis_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  site_id           UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  process           TEXT NOT NULL,        -- 'ner_call' | 'vision_call'
  model             TEXT NOT NULL,        -- model id used (e.g., 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6')
  prompt            TEXT,                 -- verbatim system prompt at call time
  input_snapshot    JSONB,                -- inputs at call time (transcript, NER, site catalogs, pillar config, brand DNA)
  output            JSONB NOT NULL,       -- the LLM's structured output (NerResult or VisionResult-slice)
  cost              JSONB,                -- { input_tokens, output_tokens }
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary query: "show me the analysis history for this asset, latest first"
CREATE INDEX IF NOT EXISTS idx_analysis_events_asset_created
  ON analysis_events (asset_id, generated_at DESC);

-- Operator-side aggregations (per-site cost, per-site rate, etc.)
CREATE INDEX IF NOT EXISTS idx_analysis_events_site
  ON analysis_events (site_id);

-- Optional: per-process aggregation (e.g., "how often did the Vision call
-- run in the last week"). Cheap composite index.
CREATE INDEX IF NOT EXISTS idx_analysis_events_process_created
  ON analysis_events (process, generated_at DESC);
