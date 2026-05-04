/**
 * Build the targeting spec for a Quick Boost.
 *
 * - Local: subscriber's city + radius (Advantage+ audience expansion within
 *   the local area — matches Meta's "People in your local area" toggle).
 * - Broad: US-wide (Advantage+ expansion). Fallback when no city is on
 *   record or subscriber explicitly opts in to wide reach.
 */
import "server-only";
import { sql } from "@/lib/db";
import { lookupCityKey } from "@/lib/meta-ads";

export interface LocalTargetingResult {
  targeting: Record<string, unknown>;
  resolvedCityName: string | null;     // For UI display ("near Pittsburgh, PA")
}

const DEFAULT_RADIUS_MILES = 25;

export async function buildQuickBoostTargeting(args: {
  siteId: string;
  scope: "local" | "broad";
  accessToken: string;
  radiusMiles?: number;
}): Promise<LocalTargetingResult> {
  if (args.scope === "broad") {
    return {
      targeting: {
        geo_locations: { countries: ["US"] },
        targeting_optimization: "expansion_all",
        age_min: 18,
        age_max: 65,
      },
      resolvedCityName: null,
    };
  }

  // Local targeting — look up the site's city and use cities targeting
  const [site] = await sql`
    SELECT location, metadata
    FROM sites
    WHERE id = ${args.siteId}
  `;

  const locationText = site?.location ? String(site.location).trim() : "";
  const metadata = (site?.metadata || {}) as Record<string, unknown>;
  const cachedKey = metadata.meta_geo_city_key as string | undefined;
  const cachedName = metadata.meta_geo_city_name as string | undefined;

  // Try cache first to avoid repeated geo lookups
  let cityMatch: { key: string; name: string } | null = cachedKey && cachedName
    ? { key: cachedKey, name: cachedName }
    : null;

  if (!cityMatch && locationText) {
    const lookup = await lookupCityKey(locationText, args.accessToken);
    if (lookup) {
      cityMatch = { key: lookup.key, name: `${lookup.name}, ${lookup.region}` };
      // Cache for next time
      const nextMetadata = { ...metadata, meta_geo_city_key: lookup.key, meta_geo_city_name: cityMatch.name };
      await sql`UPDATE sites SET metadata = ${JSON.stringify(nextMetadata)}::jsonb WHERE id = ${args.siteId}`;
    }
  }

  if (!cityMatch) {
    // Couldn't resolve — fall back to broad. Caller can detect via
    // resolvedCityName being null.
    return {
      targeting: {
        geo_locations: { countries: ["US"] },
        targeting_optimization: "expansion_all",
        age_min: 18,
        age_max: 65,
      },
      resolvedCityName: null,
    };
  }

  const radius = args.radiusMiles && args.radiusMiles > 0 ? args.radiusMiles : DEFAULT_RADIUS_MILES;
  return {
    targeting: {
      geo_locations: {
        cities: [{ key: cityMatch.key, radius, distance_unit: "mile" }],
      },
      targeting_optimization: "expansion_all",
      age_min: 18,
      age_max: 65,
    },
    resolvedCityName: cityMatch.name,
  };
}
