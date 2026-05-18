/**
 * One-shot backfill: copy legacy metadata->'geo'->>'lat'/'lng' into
 * the modern media_assets.gps_lat / gps_lng dedicated columns.
 *
 * Older assets (pre-dedicated-column era) stored EXIF GPS in the
 * metadata JSONB blob under the 'geo' key. The legacy geo-match.ts
 * still reads from that path. Newer code (project geo matcher, asset
 * loaders, service-area Pass 2) reads from dedicated columns only.
 *
 * This backfill brings legacy assets into the new schema so the
 * project geo matcher can fire on them. Idempotent — skips assets
 * that already have gps_lat populated.
 *
 * Discovered 2026-05-18 via Epicurious diagnostic: 135 of 347
 * assets had legacy GPS but none had dedicated-column GPS.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function backfill() {
  const sql = neon(process.env.DATABASE_URL);

  // Single UPDATE — atomic, fast. Only touches rows where the legacy
  // path has data and the dedicated columns are still NULL. NUMERIC
  // cast handles both string and number forms in the JSONB.
  const result = await sql`
    UPDATE media_assets
    SET
      gps_lat = (metadata->'geo'->>'lat')::numeric,
      gps_lng = (metadata->'geo'->>'lng')::numeric
    WHERE gps_lat IS NULL
      AND metadata->'geo'->>'lat' IS NOT NULL
      AND metadata->'geo'->>'lng' IS NOT NULL
    RETURNING id
  `;
  console.log(`Backfilled GPS on ${result.length} assets.`);

  // Per-site breakdown so we can see who benefits most
  const bySite = await sql`
    SELECT s.name, COUNT(*)::int AS gps_count
    FROM media_assets ma
    JOIN sites s ON s.id = ma.site_id
    WHERE ma.gps_lat IS NOT NULL AND ma.archived_at IS NULL
    GROUP BY s.name
    ORDER BY gps_count DESC
  `;
  console.log("\nGPS-enabled assets per site:");
  for (const r of bySite) console.log(`  ${r.name}: ${r.gps_count}`);
}

backfill().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
