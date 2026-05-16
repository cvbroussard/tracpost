/**
 * Query derivation for competitive market analysis.
 *
 * Generates the ranked list of target SERP queries we run to identify
 * a subscriber's real ranking competitors. The principle: search the
 * exact queries that would bring this subscriber's actual customers in.
 *
 * Query composition strategy:
 *   PRIMARY queries (highest weight) — category × primary service area
 *     "general contractor Pittsburgh"
 *   ADDITIONAL queries (medium weight) — additional categories × primary area
 *     "kitchen remodeler Pittsburgh"
 *     "bathroom remodeler Pittsburgh"
 *   GEO-EXPANSION queries (lower weight) — primary category × each additional service area
 *     "general contractor Mt. Lebanon"
 *     "general contractor Squirrel Hill"
 *
 * Caps total query count to limit SERP API spend. Default ~20 queries
 * per analysis run; tunable per subscriber tier (Enterprise gets more).
 *
 * Pure logic — no external API dependencies. Reads from existing
 * platform tables (site_gbp_categories, gbp_profile.serviceArea).
 */
import { sql } from "@/lib/db";

export interface TargetQuery {
  query: string;
  weight: "primary" | "additional" | "geo_expansion";
  /** gcid this query targets — links results back to a specific category */
  gcid: string;
  /** Place name this query targets — links results back to a specific area */
  placeName: string;
}

export interface QueryDerivationOptions {
  /** Max total queries returned. Default 20. */
  maxQueries?: number;
}

/**
 * Derive the target SERP queries for a site.
 *
 * Returns queries ranked by weight (primary first). Caps at maxQueries
 * to control SERP API spend.
 *
 * Returns empty array if the site is missing prerequisites (no GBP
 * categories assigned, no service areas declared). Caller can surface
 * a coaching message rather than burn a SERP call on no-op queries.
 */
export async function deriveTargetQueries(
  siteId: string,
  opts: QueryDerivationOptions = {},
): Promise<TargetQuery[]> {
  const maxQueries = opts.maxQueries ?? 20;

  // Load categories (with primary flag) — sorted primary first
  const categories = await sql`
    SELECT gc.gcid, gc.name, sgc.is_primary
    FROM site_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.site_id = ${siteId}
    ORDER BY sgc.is_primary DESC, gc.name
  `;

  if (categories.length === 0) return [];

  // Load service areas from GBP profile cache
  const [site] = await sql`
    SELECT gbp_profile->'serviceArea'->'places'->'placeInfos' AS place_infos
    FROM sites
    WHERE id = ${siteId}
  `;
  const placeInfos = (site?.place_infos || []) as Array<{ placeId: string; placeName: string }>;

  if (placeInfos.length === 0) return [];

  // Pick PRIMARY area by SPECIFICITY, not declaration order.
  // GBP doesn't designate a primary service area; raw order is whatever
  // the subscriber happened to add. Local SEO competes at city/township
  // level — statewide queries return directory/aggregator SERPs that
  // burn SERP API spend without surfacing real ranking competitors.
  //
  // Specificity ranking (most → least specific) reads from the cached
  // `kind` field on service_areas_canonical (populated by GBP enrichment).
  const SPECIFICITY_RANK: Record<string, number> = {
    neighborhood: 1,
    city: 2,
    metro: 3,
    zip: 4,
    county: 5,
    state: 6,
    region: 7,
  };
  const placeIds = placeInfos.map((p) => p.placeId).filter(Boolean);
  const kindRows = await sql`
    SELECT place_id, kind
    FROM service_areas_canonical
    WHERE place_id = ANY(${placeIds}::text[])
  `;
  const kindMap = new Map(kindRows.map((r) => [r.place_id as string, r.kind as string]));

  const ranked = placeInfos
    .map((p) => ({
      ...p,
      kind: kindMap.get(p.placeId) || "city",
      rank: SPECIFICITY_RANK[kindMap.get(p.placeId) || "city"] ?? 99,
    }))
    .sort((a, b) => a.rank - b.rank);

  const primaryPlace = ranked[0];
  const additionalPlaces = ranked.slice(1);

  const primaryCategory = categories.find((c) => c.is_primary as boolean);
  const additionalCategories = categories.filter((c) => !(c.is_primary as boolean));

  const queries: TargetQuery[] = [];

  // PRIMARY queries: primary category × every service area
  // This is the core competitive set — the searches that bring the
  // bulk of the subscriber's customers in.
  if (primaryCategory) {
    queries.push({
      query: `${primaryCategory.name} ${shortPlaceName(primaryPlace.placeName)}`,
      weight: "primary",
      gcid: primaryCategory.gcid as string,
      placeName: primaryPlace.placeName,
    });
    for (const place of additionalPlaces) {
      queries.push({
        query: `${primaryCategory.name} ${shortPlaceName(place.placeName)}`,
        weight: "geo_expansion",
        gcid: primaryCategory.gcid as string,
        placeName: place.placeName,
      });
    }
  }

  // ADDITIONAL queries: each additional category × primary service area
  // Captures the spread of searches across the subscriber's broader
  // service set. Geo-fixed to primary area to keep count manageable.
  for (const cat of additionalCategories) {
    queries.push({
      query: `${cat.name} ${shortPlaceName(primaryPlace.placeName)}`,
      weight: "additional",
      gcid: cat.gcid as string,
      placeName: primaryPlace.placeName,
    });
  }

  return queries.slice(0, maxQueries);
}

/**
 * Trim a full GBP place name to a SERP-friendly form.
 *   "Pittsburgh, PA, USA" → "Pittsburgh, PA"
 *   "Mt. Lebanon, PA, USA" → "Mt. Lebanon, PA"
 *   "Northwestern Pennsylvania, PA, USA" → "Northwestern Pennsylvania"
 *
 * Heuristic: drop the trailing ", USA" and keep everything before.
 * Avoids over-specificity that hurts SERP match (customers don't search
 * "kitchen remodeler Pittsburgh, PA, USA").
 */
function shortPlaceName(fullName: string): string {
  return fullName.replace(/,?\s*USA\s*$/i, "").trim();
}
