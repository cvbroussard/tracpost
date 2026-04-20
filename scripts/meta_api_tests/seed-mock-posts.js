/**
 * Seed 15 mock social posts for Meta App Review screencast.
 * Varied platforms, statuses, captions, thumbnails.
 * Run: node scripts/meta_api_tests/seed-mock-posts.js
 * Cleanup: node scripts/meta_api_tests/seed-mock-posts.js --cleanup
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const SITE_ID = "a2df5b78-a607-4633-aa09-8e116e2ccfb2";

const ACCOUNTS = {
  instagram: "e976ce78-3f66-4542-bb93-6187ffe423c3",
  facebook: "b96369a0-fe4b-435a-9101-03b4ea927c00",
  linkedin: "657d3d55-a66b-46d8-8a35-8e0b41b87395",
  pinterest: "7bcc9289-f9d6-4712-8e00-e9805917ea39",
  gbp: "0cb6007f-d29c-40ab-9ca2-49780bbb4a35",
  youtube: "0166cc23-9639-48ed-9ec3-5b82c98caf7b",
  tiktok: "097256c8-4c6d-4361-8429-add97d72d285",
  twitter: "e557e44d-7291-40e0-a86a-751baf81a389",
};

const ASSETS = [
  "aee172d2-6ff1-4f3e-84fb-5a3e8d0e7c91", // LaCanche range
  "3e41035c-8a2d-4c1f-b7e3-9d5f2a1b4c6e", // Thermador hood
  "471624c5-67bb-4e71-8d04-4495a943ef5e", // Point Breeze contemporary
  "19baeca6-3d7f-4a2e-8c5b-6f1d9e3a7b4c", // Calacatta marble
  "18ffbe45-2c6a-4d8f-9b3e-7a5f1c4d6e8a", // White painted cabinetry
  "f34493ce-57af-4bfe-8e02-2e00d1ed349e", // Point Breeze colonial
  "7bf16134-4e9a-4c3d-8a7b-2f5d1c6e9a3b", // Cream cabinetry blue island
  "9a2be14e-5d8c-4a1f-b6e3-3c7f2a9d4b5e", // White cabinetry Calacatta
  "fc353c4c-6a2b-4d9e-8c1f-4e5a3b7d2c6f", // Wine cellar column
  "fb0f9dd0-3c7e-4a5b-9d2f-1b6a4e8c3d5f", // Glass-front cabinets
  "f9f6dbad-2b5a-4c8d-7e1f-6d3c9a4b5e7f", // White shaker glass-front
  "516cbc57-4d9e-4a3c-8b2f-7e1a5c6d3f9b", // Carrara marble waterfall
  "177ee4aa-5c3b-4d7e-9a1f-2b6d4e8c5f3a", // Butler's pantry walnut
  "16710329-6e4a-4b2c-8d5f-3c9a1b7e2d4f", // White oak coordinated
  "50f44732-76f0-479b-b1e1-2c97dc1e2807", // Transformed kitchen
];

const MOCK_POSTS = [
  // Published — varied platforms
  {
    account: "instagram", status: "published", asset: 0,
    caption: "Custom lacquer inset cabinets by Crystal Cabinet Works paired with a Lacanche Sully range. This kitchen was designed for someone who takes cooking seriously.",
    published_ago_hours: 2, pillar: "result",
  },
  {
    account: "facebook", status: "published", asset: 1,
    caption: "The hood. The range. The tile. When every element speaks the same design language, the kitchen becomes more than functional — it becomes a statement.",
    published_ago_hours: 4, pillar: "result",
  },
  {
    account: "linkedin", status: "published", asset: 5,
    caption: "This 100-year-old colonial home in Point Breeze got a new personality. Open floor plan, custom contemporary kitchen, and a respect for the bones of the original structure.",
    published_ago_hours: 8, pillar: "showcase",
  },
  {
    account: "gbp", status: "published", asset: 3,
    caption: "Calacatta marble waterfall island — the centerpiece of this Shadyside kitchen renovation. Every surface was chosen to balance elegance with durability.",
    published_ago_hours: 12, pillar: "result",
  },
  {
    account: "pinterest", status: "published", asset: 6,
    caption: "Custom cream cabinetry with inset doors and a blue-painted island. The contrast creates depth without competing for attention.",
    published_ago_hours: 18, pillar: "result",
  },
  {
    account: "instagram", status: "published", asset: 7,
    caption: "White painted cabinetry meets Calacatta marble. Clean lines, warm undertones, and hardware that disappears into the design.",
    published_ago_hours: 24, pillar: "result",
  },
  {
    account: "youtube", status: "published", asset: 14,
    caption: "A perfectly transformed kitchen space — from outdated to outstanding. This is what happens when craft meets vision.",
    published_ago_hours: 36, pillar: "showcase",
  },

  // Scheduled — upcoming
  {
    account: "instagram", status: "scheduled", asset: 8,
    caption: "Wine cellar column and fully integrated refrigeration — when entertaining is part of the architecture, not an afterthought.",
    scheduled_ahead_hours: 3, pillar: "result",
  },
  {
    account: "facebook", status: "scheduled", asset: 9,
    caption: "Glass-front cabinets and walnut accents. The art of showing just enough while keeping the kitchen functional for daily use.",
    scheduled_ahead_hours: 6, pillar: "result",
  },
  {
    account: "pinterest", status: "scheduled", asset: 10,
    caption: "White shaker cabinetry with glass-front uppers — timeless design that lets the contents become part of the decor.",
    scheduled_ahead_hours: 12, pillar: "educational",
  },

  // Failed — different errors, different platforms
  {
    account: "tiktok", status: "failed", asset: 11,
    caption: "Carrara marble waterfall countertop — where the stone wraps the island like it was carved from a single block.",
    error: "OAuth token expired. Please reconnect TikTok.",
    published_ago_hours: 1, pillar: "result",
  },
  {
    account: "twitter", status: "failed", asset: 12,
    caption: "Butler's pantry with walnut floating shelves and brass hardware. The details behind the scenes matter just as much.",
    error: "API rate limit exceeded. Will retry next cycle.",
    published_ago_hours: 5, pillar: "result",
  },

  // Quarantined
  {
    account: "instagram", status: "held", asset: 13,
    caption: "White oak coordinated throughout — from the island to the floating shelves to the window trim. One material, three applications.",
    published_ago_hours: 3, pillar: "result",
  },

  // More published for variety
  {
    account: "facebook", status: "published", asset: 4,
    caption: "Polished nickel hardware on white painted inset cabinets. Sometimes restraint is the boldest design choice.",
    published_ago_hours: 48, pillar: "result",
  },
  {
    account: "instagram", status: "published", asset: 2,
    caption: "Contemporary design at its finest in Point Breeze. This kitchen proves that modern doesn't mean cold — it means intentional.",
    published_ago_hours: 72, pillar: "showcase",
  },
];

async function seed() {
  const sql = neon(process.env.DATABASE_URL);

  // Verify assets exist
  const existingAssets = await sql`SELECT id FROM media_assets WHERE site_id = ${SITE_ID} LIMIT 1`;
  if (existingAssets.length === 0) {
    console.error("No assets found for EK site");
    process.exit(1);
  }

  // Get actual asset IDs (the hardcoded ones may have wrong suffixes)
  const realAssets = await sql`
    SELECT id, storage_url FROM media_assets
    WHERE site_id = ${SITE_ID}
      AND media_type LIKE 'image%'
      AND triage_status = 'triaged'
    ORDER BY quality_score DESC
    LIMIT 15
  `;

  console.log(`Found ${realAssets.length} real assets to use`);

  let inserted = 0;
  for (const post of MOCK_POSTS) {
    const accountId = ACCOUNTS[post.account];
    const asset = realAssets[post.asset] || realAssets[0];
    const now = new Date();

    let publishedAt = null;
    let scheduledAt = null;

    if (post.status === "published" || post.status === "failed" || post.status === "held") {
      publishedAt = new Date(now.getTime() - (post.published_ago_hours || 0) * 3600000).toISOString();
    }
    if (post.status === "scheduled") {
      scheduledAt = new Date(now.getTime() + (post.scheduled_ahead_hours || 0) * 3600000).toISOString();
    }

    await sql`
      INSERT INTO social_posts (
        account_id, status, caption, media_urls, media_type,
        source_asset_id, content_pillar, published_at, scheduled_at,
        error_message, ai_generated, trigger_type,
        metadata, created_at
      ) VALUES (
        ${accountId}, ${post.status}, ${post.caption},
        ${[asset.storage_url]}, 'image',
        ${asset.id}, ${post.pillar},
        ${publishedAt}, ${scheduledAt},
        ${post.error || null}, true, 'autopilot',
        ${'{"mock_screencast": true}'}::jsonb,
        ${publishedAt || scheduledAt || now.toISOString()}
      )
    `;
    inserted++;
    console.log(`  ✓ ${post.status.padEnd(10)} ${post.account.padEnd(10)} ${post.caption.slice(0, 50)}...`);
  }

  console.log(`\n${inserted} mock posts inserted. Run with --cleanup to remove them.`);
}

async function cleanup() {
  const sql = neon(process.env.DATABASE_URL);
  const deleted = await sql`
    DELETE FROM social_posts
    WHERE metadata->>'mock_screencast' = 'true'
    RETURNING id
  `;
  console.log(`Deleted ${deleted.length} mock posts.`);
}

if (process.argv.includes("--cleanup")) {
  cleanup().catch(console.error);
} else {
  seed().catch(console.error);
}
