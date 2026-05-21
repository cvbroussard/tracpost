/**
 * Migration 136: Production-layer schema — the Media Production pipeline's
 * storage model, from variants onward.
 *
 * Background — project_tracpost_source_template_variants.md +
 * project_tracpost_pipeline_centric_workflow.md. Everything downstream of
 * asset analysis is a PRODUCTION-LAYER artifact, of two kinds:
 *
 *   media_components — INTERMEDIARIES. Image crops, the silent Kling visual
 *     render, audio tracks, music beds, caption tracks. No standalone life;
 *     they exist only to be assembled. Leaves of the composition graph.
 *
 *   media_collateral — FINISHED, PUBLISHABLE pieces. Assembled videos,
 *     articles, standard posts, carousels, GBP posts. Carry publish state,
 *     authenticity tier, distribution destination.
 *
 * Composition is a graph (a DAG), expressed by two manifest tables — the
 * CONTAINER of an edge is ALWAYS a media_collateral; components are leaves:
 *
 *   collateral_layers — collateral → component edges ("layer"): the muxed
 *     parts of a composite (visual + audio + caption → assembled video).
 *   collateral_embeds — collateral → collateral edges ("embed"): one
 *     finished piece referencing another (an article embedding a video).
 *
 * Provenance is a separate, cross-cutting layer:
 *
 *   production_events — append-only log. Every step that creates or
 *     transforms a component/collateral, with its inputs, output, process,
 *     model, prompt and settings. "Backlink all the way back" = walk events.
 *
 * ADDITIVE ONLY. asset_variants is NOT touched here — its absorption into
 * media_components (data migration + code repoint + drop) is a separate
 * follow-on. This migration just stands the new tables up.
 *
 * Run: node scripts/migrate-136-production-layer-schema.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);
  console.log("136: Creating production-layer schema...");

  // ── Intermediaries ──────────────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS media_components (
      id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id         uuid NOT NULL,
      kind            text NOT NULL,
      storage_url     text NULL,
      source_asset_id uuid NULL REFERENCES media_assets(id) ON DELETE SET NULL,
      status          text NOT NULL DEFAULT 'pending',
      render_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at      timestamptz NOT NULL DEFAULT now(),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )
  `;
  console.log("  ✓ media_components");

  // ── Finished, publishable pieces ────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS media_collateral (
      id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id           uuid NOT NULL,
      kind              text NOT NULL,
      title             text NULL,
      body              text NULL,
      assembly_spec     jsonb NOT NULL DEFAULT '{}'::jsonb,
      authenticity_tier text NULL,
      publish_state     text NOT NULL DEFAULT 'draft',
      storage_url       text NULL,
      metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now()
    )
  `;
  console.log("  ✓ media_collateral");

  // ── Composition manifest — layer edges (collateral → component) ─────
  await sql`
    CREATE TABLE IF NOT EXISTS collateral_layers (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      collateral_id uuid NOT NULL REFERENCES media_collateral(id) ON DELETE CASCADE,
      component_id  uuid NOT NULL REFERENCES media_components(id) ON DELETE RESTRICT,
      position      int NOT NULL,
      role          text NULL,
      edge_spec     jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at    timestamptz NOT NULL DEFAULT now()
    )
  `;
  console.log("  ✓ collateral_layers");

  // ── Composition manifest — embed edges (collateral → collateral) ────
  await sql`
    CREATE TABLE IF NOT EXISTS collateral_embeds (
      id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      container_id uuid NOT NULL REFERENCES media_collateral(id) ON DELETE CASCADE,
      member_id    uuid NOT NULL REFERENCES media_collateral(id) ON DELETE RESTRICT,
      position     int NOT NULL,
      placement    jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at   timestamptz NOT NULL DEFAULT now(),
      CHECK (container_id <> member_id)
    )
  `;
  console.log("  ✓ collateral_embeds");

  // ── Provenance — append-only event log ──────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS production_events (
      id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id              uuid NOT NULL,
      process              text NOT NULL,
      model                text NULL,
      prompt               text NULL,
      settings             jsonb NOT NULL DEFAULT '{}'::jsonb,
      inputs               jsonb NOT NULL DEFAULT '[]'::jsonb,
      output_component_id  uuid NULL REFERENCES media_components(id) ON DELETE SET NULL,
      output_collateral_id uuid NULL REFERENCES media_collateral(id) ON DELETE SET NULL,
      created_at           timestamptz NOT NULL DEFAULT now(),
      CHECK (NOT (output_component_id IS NOT NULL AND output_collateral_id IS NOT NULL))
    )
  `;
  console.log("  ✓ production_events");

  // ── Indexes ─────────────────────────────────────────────────────────
  await sql`CREATE INDEX IF NOT EXISTS idx_components_site ON media_components(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_components_source ON media_components(source_asset_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_collateral_site ON media_collateral(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_collateral_site_kind ON media_collateral(site_id, kind)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_layers_collateral ON collateral_layers(collateral_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_layers_component ON collateral_layers(component_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_embeds_container ON collateral_embeds(container_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_embeds_member ON collateral_embeds(member_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_out_component ON production_events(output_component_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_out_collateral ON production_events(output_collateral_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_events_site ON production_events(site_id)`;
  console.log("  ✓ indexes");

  console.log("\nMigration 136 complete — production-layer schema stood up.");
}

migrate().catch((e) => {
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
