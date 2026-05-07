/**
 * v2 generator redesign foundations.
 *
 * Three additive schema changes for the per-article-type generator
 * redesign (per project_tracpost_v2_redesign_plan.md):
 *
 *   1. project_chapters table — chapter-based project narratives.
 *      Each project has many chapters; each chapter generates its own
 *      blog article when "ready". Replaces the 3-phase approach.
 *
 *   2. blog_posts_v2.project_id (nullable FK) — chapter articles bind
 *      back to their parent project so the project page can render
 *      "chapters" naturally.
 *
 *   3. services_v2.service_areas + service_radius_miles — optional
 *      geo-scoping for service pages. Both nullable; either or both
 *      can be set. Drives geo-aware copy in the service generator.
 *
 * Also seeds one industry chapter template ('renovation_remodel')
 * applicable to construction/kitchen/bath businesses (Epicurious + B2).
 *
 * Run: node scripts/migrate-097-v2-redesign-foundations.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("v2 redesign foundations — migration 097");

  // ── project_chapters ───────────────────────────────────────────
  await sql`
    CREATE TABLE IF NOT EXISTS project_chapters (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id         UUID NOT NULL REFERENCES projects_v2(id) ON DELETE CASCADE,
      slug               TEXT NOT NULL,
      title              TEXT NOT NULL,
      intent             TEXT NOT NULL,
      sequence_index     INT NOT NULL,
      trigger_kind       TEXT NOT NULL
        CHECK (trigger_kind IN ('milestone_date','manual','asset_threshold')),
      asset_filter       JSONB NOT NULL DEFAULT '{}'::jsonb,
      structure_template TEXT,
      status             TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','ready','generated','skipped')),
      blog_post_id       UUID REFERENCES blog_posts_v2(id) ON DELETE SET NULL,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      generated_at       TIMESTAMPTZ,
      UNIQUE (project_id, slug)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pc_project ON project_chapters (project_id, sequence_index)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pc_status ON project_chapters (project_id, status)`;
  console.log("  ✓ project_chapters");

  // ── blog_posts_v2.project_id FK ────────────────────────────────
  await sql`
    ALTER TABLE blog_posts_v2
      ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects_v2(id) ON DELETE SET NULL
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_bpv2_project ON blog_posts_v2 (project_id) WHERE project_id IS NOT NULL`;
  console.log("  ✓ blog_posts_v2.project_id");

  // ── services_v2 geo fields ─────────────────────────────────────
  await sql`
    ALTER TABLE services_v2
      ADD COLUMN IF NOT EXISTS service_areas TEXT[] NOT NULL DEFAULT '{}'
  `;
  await sql`
    ALTER TABLE services_v2
      ADD COLUMN IF NOT EXISTS service_radius_miles INT
  `;
  console.log("  ✓ services_v2.service_areas + service_radius_miles");

  // ── chapter templates table ────────────────────────────────────
  // Industry-keyed templates. When a project is created (or migrated
  // into v2), the appropriate template's chapters get instantiated
  // into the project_chapters table for that project.
  await sql`
    CREATE TABLE IF NOT EXISTS chapter_templates (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      industry_key       TEXT NOT NULL,
      slug               TEXT NOT NULL,
      title              TEXT NOT NULL,
      intent             TEXT NOT NULL,
      sequence_index     INT NOT NULL,
      trigger_kind       TEXT NOT NULL
        CHECK (trigger_kind IN ('milestone_date','manual','asset_threshold')),
      asset_filter       JSONB NOT NULL DEFAULT '{}'::jsonb,
      structure_template TEXT,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (industry_key, slug)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_ct_industry ON chapter_templates (industry_key, sequence_index)`;
  console.log("  ✓ chapter_templates");

  // ── Seed renovation/remodel chapter template ───────────────────
  // Applies to construction, kitchen, bath, whole-house remodel
  // businesses (Epicurious + B2 both fit). Seven chapters cover the
  // full lifecycle from discovery to reveal.
  const renovationChapters = [
    {
      slug: "discovery",
      title: "Discovery & Design",
      intent: "Tell the story of how this project began. The conversation with the client, the vision they brought, the questions you asked, the early design decisions that shaped what the rest of the project would become.",
      sequence_index: 0,
      trigger_kind: "manual",
      asset_filter: { content_tags: ["before", "design", "discovery", "concept"] },
      structure_template: "1. Open with the client's situation — what they had, what wasn't working\n2. The discovery conversation — what you learned\n3. The design decisions and their rationale\n4. The plan that emerged",
    },
    {
      slug: "demolition",
      title: "Demolition & Site Prep",
      intent: "The project starts physically. Walls coming down, old systems removed, the site prepared for the new build. Show what the space looked like in transition and what you discovered behind the walls.",
      sequence_index: 1,
      trigger_kind: "asset_threshold",
      asset_filter: { content_tags: ["demo", "demolition", "in_progress", "site_prep", "reveal_walls"] },
      structure_template: "1. What you found when the walls came down\n2. Surprises and how you handled them\n3. Site prep decisions — protection, staging, scheduling",
    },
    {
      slug: "framing-and-rough-in",
      title: "Framing & Rough-In",
      intent: "The bones of the new space take shape. Framing, electrical rough-in, plumbing rough-in, HVAC routing. The decisions made now that nobody will ever see but that everything depends on.",
      sequence_index: 2,
      trigger_kind: "asset_threshold",
      asset_filter: { content_tags: ["framing", "rough_in", "electrical", "plumbing", "in_progress"] },
      structure_template: "1. Why infrastructure decisions matter more than finishes\n2. Specific rough-in choices for this project\n3. Inspections and trade coordination",
    },
    {
      slug: "materials-and-trades",
      title: "Materials & Trades",
      intent: "The craft layer — cabinetry, countertops, tile, flooring, custom millwork. The vendors you chose, the materials specified, the trades coordinating to bring it all together.",
      sequence_index: 3,
      trigger_kind: "asset_threshold",
      asset_filter: { content_tags: ["materials", "cabinetry", "countertops", "tile", "trades", "in_progress"] },
      structure_template: "1. The materials and why each was chosen\n2. The vendors and partnerships behind them\n3. How the trades coordinated\n4. Decisions made on-site as the build progressed",
    },
    {
      slug: "finishes-and-details",
      title: "Finishes & Details",
      intent: "The details that separate a finished space from a memorable one. Hardware, paint, lighting, plumbing fixtures, the final touches that make the room feel intentional.",
      sequence_index: 4,
      trigger_kind: "asset_threshold",
      asset_filter: { content_tags: ["finishes", "hardware", "lighting", "fixtures", "paint", "details"] },
      structure_template: "1. The detail-level decisions and why they matter\n2. Specific finishes specified\n3. The craft of installation",
    },
    {
      slug: "reveal",
      title: "The Reveal",
      intent: "The finished space. What it looks like, how it functions, what changed from the before. This is the proof — the concrete outcome that justifies everything that came before.",
      sequence_index: 5,
      trigger_kind: "milestone_date",
      asset_filter: { content_tags: ["reveal", "finished", "after", "completed"] },
      structure_template: "1. Open with the finished space — paint a picture\n2. How it works in daily use\n3. Before/after comparisons\n4. What the client says now",
    },
    {
      slug: "lessons",
      title: "Lessons & Takeaways",
      intent: "Reflective post-mortem. What this project taught you, what you'd do differently, what made it succeed. Useful for the next client thinking about a similar project.",
      sequence_index: 6,
      trigger_kind: "manual",
      asset_filter: {},
      structure_template: "1. The non-obvious lessons\n2. What surprised you\n3. What you'd recommend to similar clients",
    },
  ];

  for (const ch of renovationChapters) {
    await sql`
      INSERT INTO chapter_templates (
        industry_key, slug, title, intent, sequence_index,
        trigger_kind, asset_filter, structure_template
      ) VALUES (
        'renovation_remodel', ${ch.slug}, ${ch.title}, ${ch.intent}, ${ch.sequence_index},
        ${ch.trigger_kind}, ${JSON.stringify(ch.asset_filter)}::jsonb, ${ch.structure_template}
      )
      ON CONFLICT (industry_key, slug) DO UPDATE SET
        title = EXCLUDED.title,
        intent = EXCLUDED.intent,
        sequence_index = EXCLUDED.sequence_index,
        trigger_kind = EXCLUDED.trigger_kind,
        asset_filter = EXCLUDED.asset_filter,
        structure_template = EXCLUDED.structure_template
    `;
  }
  console.log(`  ✓ Seeded renovation_remodel chapter template (${renovationChapters.length} chapters)`);

  console.log("");
  console.log("Migration complete.");
}

migrate().catch((e) => {
  console.error("ERR:", e.message);
  console.error(e.stack);
  process.exit(1);
});
