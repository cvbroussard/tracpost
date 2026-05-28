/**
 * Build the targeting spec for a Quick Boost.
 *
 * - Local: derived from the connected FB Page's location (Meta's
 *   authoritative source for "where this Page advertises locally"),
 *   matching what Meta's native "People in your local area" preset
 *   does. Falls back to sites.location if no Page is connected.
 * - Broad: US-wide. Subscriber opt-in fallback.
 *
 * Targeting precision priority:
 *   1. Page lat/lon → custom_locations (most precise)
 *   2. Page city/state → cities key lookup via adgeolocation search
 *   3. sites.location → cities key lookup
 *   4. Broad US fallback
 */
import "server-only";
import { sql } from "@/lib/db";
import { lookupCityKey } from "@/lib/meta-ads";
import { getPageLocation } from "@/lib/meta";
import { decrypt } from "@/lib/crypto";

export interface LocalTargetingResult {
  targeting: Record<string, unknown>;
  resolvedCityName: string | null;
  source: "page_lat_lon" | "page_city" | "site_location" | "broad_fallback";
}

const DEFAULT_RADIUS_MILES = 25;

const broadTargeting = (): Record<string, unknown> => ({
  geo_locations: { countries: ["US"] },
  targeting_optimization: "expansion_all",
  age_min: 18,
  age_max: 65,
});

export async function buildQuickBoostTargeting(args: {
  siteId: string;
  scope: "local" | "broad";
  accessToken: string;        // Ads OAuth token (used for adgeolocation search)
  radiusMiles?: number;
}): Promise<LocalTargetingResult> {
  if (args.scope === "broad") {
    return {
      targeting: broadTargeting(),
      resolvedCityName: null,
      source: "broad_fallback",
    };
  }

  const radius = args.radiusMiles && args.radiusMiles > 0 ? args.radiusMiles : DEFAULT_RADIUS_MILES;

  // Step 1: try the connected FB Page's location
  const pageRows = await sql`
    SELECT pa.id, pa.asset_id AS page_id, pa.metadata
    FROM business_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.business_id = ${args.siteId}
      AND pa.asset_type = 'facebook_page'
      AND spa.is_primary = true
    LIMIT 1
  `;

  if (pageRows.length > 0) {
    const page = pageRows[0];
    const meta = (page.metadata || {}) as Record<string, unknown>;

    // Try cached lat/lon first
    const cachedLat = typeof meta.page_loc_lat === "number" ? (meta.page_loc_lat as number) : null;
    const cachedLon = typeof meta.page_loc_lon === "number" ? (meta.page_loc_lon as number) : null;
    const cachedCity = typeof meta.page_loc_city === "string" ? (meta.page_loc_city as string) : null;
    const cachedState = typeof meta.page_loc_state === "string" ? (meta.page_loc_state as string) : null;

    if (cachedLat !== null && cachedLon !== null) {
      return {
        targeting: {
          geo_locations: {
            custom_locations: [
              { latitude: cachedLat, longitude: cachedLon, radius, distance_unit: "mile" },
            ],
          },
          targeting_optimization: "expansion_all",
          age_min: 18,
          age_max: 65,
        },
        resolvedCityName: cachedCity ? `${cachedCity}${cachedState ? `, ${cachedState}` : ""}` : null,
        source: "page_lat_lon",
      };
    }

    // Not cached — fetch from FB Page now and cache
    const pageToken = meta.page_access_token as string | undefined;
    if (pageToken) {
      const decryptedToken = pageToken; // Page tokens stored as-is, not encrypted
      const pageLoc = await getPageLocation(page.page_id as string, decryptedToken);
      if (pageLoc) {
        const newMeta = {
          ...meta,
          page_loc_lat: pageLoc.latitude,
          page_loc_lon: pageLoc.longitude,
          page_loc_city: pageLoc.city,
          page_loc_state: pageLoc.state,
          page_loc_country_code: pageLoc.countryCode,
        };
        await sql`UPDATE platform_assets SET metadata = ${JSON.stringify(newMeta)}::jsonb WHERE id = ${page.id}`;

        if (pageLoc.latitude !== null && pageLoc.longitude !== null) {
          return {
            targeting: {
              geo_locations: {
                custom_locations: [
                  { latitude: pageLoc.latitude, longitude: pageLoc.longitude, radius, distance_unit: "mile" },
                ],
              },
              targeting_optimization: "expansion_all",
              age_min: 18,
              age_max: 65,
            },
            resolvedCityName: pageLoc.city ? `${pageLoc.city}${pageLoc.state ? `, ${pageLoc.state}` : ""}` : null,
            source: "page_lat_lon",
          };
        }

        // Have city but no lat/lon — fall through to city-key lookup
        if (pageLoc.city) {
          const cityQuery = pageLoc.state ? `${pageLoc.city}, ${pageLoc.state}` : pageLoc.city;
          const cityMatch = await lookupCityKey(cityQuery, args.accessToken);
          if (cityMatch) {
            return {
              targeting: {
                geo_locations: {
                  cities: [{ key: cityMatch.key, radius, distance_unit: "mile" }],
                },
                targeting_optimization: "expansion_all",
                age_min: 18,
                age_max: 65,
              },
              resolvedCityName: `${cityMatch.name}, ${cityMatch.region}`,
              source: "page_city",
            };
          }
        }
      }
    }
  }

  // Step 2: fallback to sites.location lookup (less authoritative)
  const [site] = await sql`
    SELECT location FROM businesses WHERE id = ${args.siteId}
  `;
  const locationText = site?.location ? String(site.location).trim() : "";
  if (locationText) {
    // Try the full text first, then just the city portion (Meta's adgeolocation
    // sometimes rejects "City, State" but accepts "City")
    const queries = [locationText, locationText.split(",")[0].trim()].filter(
      (q, i, arr) => q.length > 0 && arr.indexOf(q) === i
    );
    for (const q of queries) {
      const cityMatch = await lookupCityKey(q, args.accessToken);
      if (cityMatch) {
        return {
          targeting: {
            geo_locations: {
              cities: [{ key: cityMatch.key, radius, distance_unit: "mile" }],
            },
            targeting_optimization: "expansion_all",
            age_min: 18,
            age_max: 65,
          },
          resolvedCityName: `${cityMatch.name}, ${cityMatch.region}`,
          source: "site_location",
        };
      }
    }
  }

  // Step 3: broad fallback
  return {
    targeting: broadTargeting(),
    resolvedCityName: null,
    source: "broad_fallback",
  };
}
