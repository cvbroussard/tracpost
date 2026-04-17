/**
 * Seeds default render templates per business_type × platform.
 * These are the Phase 6b predefined templates that the playbook
 * reads from instead of hardcoded rules. Idempotent — uses upsert
 * on (name, platform, business_type).
 *
 * Run: node scripts/seed-render-templates.js
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);

const TEMPLATES = [
  // ── Instagram ──
  { name: "IG Standard — Warm", platform: "instagram", business_type: null, content_type: null, is_default: true,
    config: { crop: "4:5", grade: "warm_bright", textOverlays: [], watermark: true, watermarkPosition: "bottom-right" } },
  { name: "IG Contractor — CTA", platform: "instagram", business_type: "contractor", content_type: null, is_default: true,
    config: { crop: "4:5", grade: "warm_bright", textOverlays: [{ text: "Free estimate → link in bio", position: "bottom-right", fontSize: 18, color: "#ffffff", backgroundColor: "rgba(0,0,0,0.5)" }], watermark: true, watermarkPosition: "bottom-left" } },
  { name: "IG Salon — Clean", platform: "instagram", business_type: "salon", content_type: null, is_default: true,
    config: { crop: "4:5", grade: "warm_natural", textOverlays: [], watermark: true, watermarkPosition: "bottom-right" } },
  { name: "IG Restaurant — Saturated", platform: "instagram", business_type: "restaurant", content_type: null, is_default: true,
    config: { crop: "1:1", grade: "warm_bright", textOverlays: [], watermark: false } },

  // ── Instagram Stories ──
  { name: "Story Standard", platform: "instagram_story", business_type: null, content_type: null, is_default: true,
    config: { crop: "9:16", grade: "warm_bright", textOverlays: [], watermark: false } },

  // ── TikTok ──
  { name: "TikTok Standard", platform: "tiktok", business_type: null, content_type: null, is_default: true,
    config: { crop: "9:16", grade: "warm_bright", textOverlays: [], watermark: false } },
  { name: "TikTok — Headline", platform: "tiktok", business_type: null, content_type: "project_story", is_default: false,
    config: { crop: "9:16", grade: "warm_bright", textOverlays: [{ text: "Project transformation →", position: "bottom", fontSize: 36, color: "#ffffff", backgroundColor: "rgba(0,0,0,0.6)" }], watermark: false } },

  // ── Facebook ──
  { name: "FB Standard", platform: "facebook", business_type: null, content_type: null, is_default: true,
    config: { crop: "1:1", grade: "warm_natural", textOverlays: [], watermark: true, watermarkPosition: "bottom-right" } },

  // ── YouTube ──
  { name: "YT Thumbnail", platform: "youtube", business_type: null, content_type: null, is_default: true,
    config: { crop: "16:9", grade: "warm_natural", textOverlays: [], watermark: false } },

  // ── Pinterest ──
  { name: "Pin Standard — Tall + Headline", platform: "pinterest", business_type: null, content_type: null, is_default: true,
    config: { crop: "2:3", grade: "warm_bright", textOverlays: [{ text: "{{scene_headline}}", position: "bottom-center", fontSize: 36, fontWeight: "bold", color: "#ffffff", backgroundColor: "rgba(0,0,0,0.65)" }], watermark: true, watermarkPosition: "bottom-left" } },
  { name: "Pin Kitchen — Tall + Headline", platform: "pinterest", business_type: "contractor", content_type: "kitchen",
    config: { crop: "2:3", grade: "warm_bright", textOverlays: [{ text: "{{scene_headline}} — {{location}}", position: "bottom-center", fontSize: 32, fontWeight: "bold", color: "#ffffff", backgroundColor: "rgba(0,0,0,0.65)" }], watermark: true, watermarkPosition: "bottom-left" } },

  // ── LinkedIn ──
  { name: "LinkedIn Standard — Professional", platform: "linkedin", business_type: null, content_type: null, is_default: true,
    config: { crop: "1:1", grade: "clean_natural", textOverlays: [], watermark: true, watermarkPosition: "bottom-right" } },
  { name: "LinkedIn Coach — Thought Leadership", platform: "linkedin", business_type: "coach", content_type: null, is_default: true,
    config: { crop: "1:1", grade: "clean_natural", textOverlays: [{ text: "{{stat_overlay}}", position: "bottom-left", fontSize: 20, color: "#ffffff", backgroundColor: "rgba(0,0,0,0.5)" }], watermark: true, watermarkPosition: "bottom-right" } },

  // ── GBP ──
  { name: "GBP Standard", platform: "gbp", business_type: null, content_type: null, is_default: true,
    config: { crop: "16:9", grade: "clean_natural", textOverlays: [], watermark: false } },

  // ── Blog ──
  { name: "Blog Hero — Wide", platform: "blog", business_type: null, content_type: null, is_default: true,
    config: { crop: "16:9", grade: "warm_natural", textOverlays: [], watermark: false } },
];

async function seed() {
  console.log(`Seeding ${TEMPLATES.length} render templates...`);

  let inserted = 0;
  let updated = 0;

  for (const t of TEMPLATES) {
    const res = await sql`
      INSERT INTO render_templates (name, platform, business_type, content_type, config, is_default)
      VALUES (${t.name}, ${t.platform}, ${t.business_type}, ${t.content_type}, ${JSON.stringify(t.config)}::jsonb, ${t.is_default})
      ON CONFLICT (id) DO NOTHING
      RETURNING (xmax = 0) AS is_insert
    `;
    if (res.length > 0 && res[0]?.is_insert) inserted++;
    else if (res.length > 0) updated++;
    else inserted++; // no conflict = fresh insert
  }

  const [total] = await sql`SELECT COUNT(*)::int AS n FROM render_templates`;
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Total rows: ${total.n}`);
  console.log("Done.");
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
