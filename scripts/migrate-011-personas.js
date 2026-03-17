const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function migrate() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Migration 011: Cast of Characters (Personas)...\n");

  // personas — recurring characters in a site's content
  await sql`
    CREATE TABLE IF NOT EXISTS personas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'pet',
      description TEXT,
      visual_cues TEXT[] DEFAULT '{}',
      narrative_context TEXT,
      relationships JSONB DEFAULT '{}',
      appearance_count INTEGER DEFAULT 0,
      first_seen_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("  + personas table");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_personas_site
    ON personas(site_id)
  `;
  console.log("  + idx_personas_site index");

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_personas_site_name
    ON personas(site_id, LOWER(name))
  `;
  console.log("  + idx_personas_site_name unique index");

  // asset_personas — join table linking detected personas to assets
  await sql`
    CREATE TABLE IF NOT EXISTS asset_personas (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
      persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
      confidence NUMERIC(3,2) DEFAULT 1.00,
      role TEXT DEFAULT 'subject',
      detected_by TEXT DEFAULT 'manual',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("  + asset_personas table");

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_personas_unique
    ON asset_personas(asset_id, persona_id)
  `;
  console.log("  + idx_asset_personas_unique index");

  await sql`
    CREATE INDEX IF NOT EXISTS idx_asset_personas_persona
    ON asset_personas(persona_id)
  `;
  console.log("  + idx_asset_personas_persona index");

  console.log("\nMigration 011 complete.");
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
