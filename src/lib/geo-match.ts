/**
 * Geo-matching: auto-associate assets with branches and projects by GPS proximity.
 *
 * Runs in two directions:
 * 1. On asset upload — match against existing branches/projects with addresses
 * 2. On branch/project create — backfill matching assets by GPS
 *
 * Note: per migration 110, the previous `locations` table was renamed to
 * `branches` to better reflect its actual purpose (per-business operating
 * units, not geographic regions). Service areas are a separate platform-
 * scoped entity in service_areas_canonical / site_service_areas.
 */
import { sql } from "@/lib/db";

const RADIUS_KM = 0.5; // Match within 500 meters

/**
 * Haversine distance between two lat/lng points in kilometers.
 */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Geocode an address string to lat/lng using Google Geocoding API.
 * Returns null if no API key or geocoding fails.
 */
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;

    const data = await res.json();
    const loc = data.results?.[0]?.geometry?.location;
    if (loc?.lat && loc?.lng) {
      return { lat: loc.lat, lng: loc.lng };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * On asset upload: match a GPS-tagged asset against existing branches and projects.
 * Auto-creates asset_branches and asset_projects links.
 */
export async function matchAssetToEntities(
  assetId: string,
  siteId: string,
  lat: number,
  lng: number
): Promise<{ branches: number; projects: number }> {
  let branchMatches = 0;
  let projectMatches = 0;

  // Match against branches with lat/lng in metadata
  const branches = await sql`
    SELECT id, metadata FROM locations
    WHERE business_id = ${siteId} AND metadata->>'lat' IS NOT NULL
  `;

  for (const br of branches) {
    const meta = (br.metadata || {}) as Record<string, unknown>;
    const brLat = meta.lat as number;
    const brLng = meta.lng as number;
    if (brLat && brLng && haversineKm(lat, lng, brLat, brLng) <= RADIUS_KM) {
      await sql`
        INSERT INTO asset_locations (asset_id, location_id)
        VALUES (${assetId}, ${br.id})
        ON CONFLICT DO NOTHING
      `;
      branchMatches++;
    }
  }

  // Match against projects with dedicated gps_lat/gps_lng columns
  // (migration 126, 2026-05-18). Legacy metadata->>'lat' path retired
  // 2026-05-19. Branches still use metadata-stored lat/lng above —
  // they need their own canonical-place migration eventually.
  const projects = await sql`
    SELECT id, gps_lat, gps_lng FROM projects
    WHERE business_id = ${siteId} AND gps_lat IS NOT NULL
  `;

  for (const proj of projects) {
    const projLat = Number(proj.gps_lat);
    const projLng = Number(proj.gps_lng);
    if (Number.isFinite(projLat) && Number.isFinite(projLng) &&
        haversineKm(lat, lng, projLat, projLng) <= RADIUS_KM) {
      await sql`
        INSERT INTO asset_projects (asset_id, project_id)
        VALUES (${assetId}, ${proj.id})
        ON CONFLICT DO NOTHING
      `;
      projectMatches++;
    }
  }

  return { branches: branchMatches, projects: projectMatches };
}

/**
 * On branch/project create: backfill matching assets by GPS.
 * Geocodes the address, stores lat/lng, then matches existing assets.
 */
export async function backfillAssetsForEntity(
  entityType: "branch" | "project",
  entityId: string,
  siteId: string,
  address: string
): Promise<{ geocoded: boolean; matched: number }> {
  const geo = await geocode(address);
  if (!geo) return { geocoded: false, matched: 0 };

  // Store lat/lng on the entity. Projects use dedicated columns as of
  // migration 126 (2026-05-18); legacy metadata write retired
  // 2026-05-19. Branches still use metadata (separate migration
  // pending — branches don't have dedicated gps columns yet).
  if (entityType === "branch") {
    await sql`
      UPDATE locations
      SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ lat: geo.lat, lng: geo.lng })}::jsonb
      WHERE id = ${entityId}
    `;
  } else {
    await sql`
      UPDATE projects
      SET gps_lat = ${geo.lat}, gps_lng = ${geo.lng}
      WHERE id = ${entityId}
    `;
  }

  // Find assets with GPS in dedicated columns (legacy metadata.geo
  // backfilled into columns 2026-05-18; new uploads write to columns
  // only as of 2026-05-19).
  const assets = await sql`
    SELECT id, gps_lat, gps_lng FROM media_assets
    WHERE business_id = ${siteId}
      AND gps_lat IS NOT NULL
  `;

  let matched = 0;
  const joinTable = entityType === "branch" ? "asset_locations" : "asset_projects";
  const fkColumn = entityType === "branch" ? "location_id" : "project_id";

  for (const asset of assets) {
    const aLat = Number(asset.gps_lat);
    const aLng = Number(asset.gps_lng);
    if (!Number.isFinite(aLat) || !Number.isFinite(aLng)) continue;

    if (haversineKm(aLat, aLng, geo.lat, geo.lng) <= RADIUS_KM) {
      // Use raw query for dynamic table/column name
      await sql.query(
        `INSERT INTO ${joinTable} (asset_id, ${fkColumn}) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [asset.id, entityId]
      );
      matched++;
    }
  }

  return { geocoded: true, matched };
}
