/**
 * SerpAPI wrapper for Google SERP queries.
 *
 * Returns Google's Local Pack (map + top 3 businesses) plus organic
 * top 10. The Local Pack is the load-bearing competitive surface for
 * local SEO — that's where businesses with place_ids surface, and
 * place_ids let us read their GBP profiles via Places API downstream.
 *
 * Provider choice: SerpAPI for V1 (cleanest API, well-documented,
 * fast to integrate). Migrate to DataForSEO at scale if cost becomes
 * meaningful — wrapper interface stays stable, only `fetchSerp` swaps.
 *
 * Cost at SerpAPI: ~$0.0075/query. For 20 queries × weekly = ~$0.60/mo
 * per subscriber. Trivial.
 *
 * Env: SERPAPI_KEY
 */
export interface LocalPackResult {
  /** Position 1-3 in the local pack */
  position: number;
  /** Business title as displayed */
  title: string;
  /**
   * SerpAPI's `place_id` field — Google Maps CID (numeric Customer ID like
   * "14198205168375289065"), NOT the "ChIJ..." Place ID that Places API
   * (New) expects. CIDs are stable identifiers for the same business but
   * require a separate lookup if we want full GBP profile via Places API.
   * For V1 we use CID as the join key for dedup across queries; Places
   * enrichment deferred to V2.
   */
  placeId: string;
  /** Knowledge Graph ID from SerpAPI (e.g. "/g/11ltg_20q5") — alternate identifier */
  knowledgeGraphId?: string;
  /** Star rating, 0-5 */
  rating?: number;
  /** Total review count */
  reviewsCount?: number;
  /** Business type label (e.g., "General contractor") — SerpAPI's primary type */
  type?: string;
  /** Formatted address */
  address?: string;
  /** Phone number if surfaced */
  phone?: string;
  /** Website URL if surfaced (extracted from links.website) */
  website?: string;
  /** Years in business if surfaced (e.g., "3+ years in business") */
  yearsInBusiness?: string;
  /** Single-sentence description SerpAPI surfaces (often pulled from reviews) */
  description?: string;
  /** GPS lat/lng of the business location */
  coordinates?: { latitude: number; longitude: number };
}

export interface OrganicResult {
  /** Position 1-10 in organic results */
  position: number;
  title: string;
  link: string;
  displayedLink?: string;
  snippet?: string;
}

export interface SerpResponse {
  /** The query we ran */
  query: string;
  /** Search location parameter (e.g., "Pittsburgh, PA") */
  searchLocation: string;
  /** When SerpAPI returned results */
  fetchedAt: string;
  /** Local pack businesses (map + top 3) — the competitive gold */
  localPack: LocalPackResult[];
  /** Organic top 10 results */
  organic: OrganicResult[];
  /** Raw response shape for debugging — strip in prod if size becomes a concern */
  rawMeta?: Record<string, unknown>;
}

/**
 * Fetch SerpAPI results for a Google search query.
 *
 * NOTE: This is a stub that throws until SERPAPI_KEY is provisioned.
 * The full implementation is one function — see commented body. The
 * stub deliberately exists so downstream code (parsing, extraction,
 * analysis assembly) can be built and tested against this interface
 * before the API key arrives.
 *
 * To activate: set SERPAPI_KEY env var, uncomment the fetch body.
 */
export async function fetchSerp(
  query: string,
  location: string,
): Promise<SerpResponse> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) {
    throw new Error(
      "SERPAPI_KEY not set — competitive intel SERP fetches are stubbed. " +
        "Provision a SerpAPI account and set SERPAPI_KEY in env to enable.",
    );
  }

  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", query);
  url.searchParams.set("location", location);
  url.searchParams.set("hl", "en");
  url.searchParams.set("gl", "us");
  url.searchParams.set("num", "10");
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`SerpAPI fetch failed (${res.status}): ${await res.text().then((t) => t.slice(0, 200))}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  return parseSerpResponse(query, location, data);
}

/**
 * Parse SerpAPI's raw response into our normalized SerpResponse shape.
 * Exported separately so we can unit-test parsing against mock JSON
 * without needing the API.
 */
export function parseSerpResponse(
  query: string,
  searchLocation: string,
  data: Record<string, unknown>,
): SerpResponse {
  // SerpAPI wraps local results: data.local_results.places[] — not flat.
  const localResultsWrapper = (data.local_results || {}) as Record<string, unknown>;
  const localResults = (localResultsWrapper.places || []) as Array<Record<string, unknown>>;
  const organicResults = (data.organic_results || []) as Array<Record<string, unknown>>;

  const localPack: LocalPackResult[] = localResults.map((r, i) => {
    const links = (r.links || {}) as Record<string, unknown>;
    const coords = (r.gps_coordinates || {}) as Record<string, unknown>;
    return {
      position: (r.position as number) ?? i + 1,
      title: (r.title as string) || "",
      placeId: String(r.place_id || ""),
      knowledgeGraphId: (r.provider_id as string) ?? undefined,
      rating: (r.rating as number) ?? undefined,
      reviewsCount: (r.reviews as number) ?? undefined,
      type: (r.type as string) ?? undefined,
      address: (r.address as string) ?? undefined,
      phone: (r.phone as string) ?? undefined,
      website: (links.website as string) ?? undefined,
      yearsInBusiness: (r.years_in_business as string) ?? undefined,
      description: (r.description as string) ?? undefined,
      coordinates: typeof coords.latitude === "number" && typeof coords.longitude === "number"
        ? { latitude: coords.latitude, longitude: coords.longitude }
        : undefined,
    };
  }).filter((r) => r.placeId); // Drop rows with no CID — can't dedup them

  const organic: OrganicResult[] = organicResults.map((r, i) => ({
    position: (r.position as number) ?? i + 1,
    title: (r.title as string) || "",
    link: (r.link as string) || "",
    displayedLink: (r.displayed_link as string) ?? undefined,
    snippet: (r.snippet as string) ?? undefined,
  }));

  return {
    query,
    searchLocation,
    fetchedAt: new Date().toISOString(),
    localPack,
    organic,
  };
}

/**
 * A competitor's full GBP category list, extracted via the SerpAPI
 * google_maps engine (Tier 2 enrichment).
 *
 * The standard local pack (Tier 1) returns one `type` string per result
 * — the primary category. The google_maps `place` endpoint returns the
 * full set (primary + additional), with both display names and the
 * matching gcid-style IDs.
 */
export interface CompetitorCategories {
  /** Google CID (matches LocalPackResult.placeId — our join key) */
  cid: string;
  /** Business title from the place page */
  title: string;
  /**
   * Full set of gcids the competitor has declared, in `gcid:<id>` form
   * (catalog-ready — prepend already applied).
   */
  gcids: string[];
  /** Parallel to `gcids` — display names for each. Same length. */
  displayNames: string[];
  /**
   * Best-guess primary gcid, derived by matching the local-pack `type`
   * string (Tier 1) against the Tier 2 display names. SerpAPI returns
   * the Tier 2 list alphabetically, so we can't infer primary from
   * order alone. null if no match.
   */
  primaryGcid: string | null;
}

/**
 * Fetch a competitor's full GBP category list via SerpAPI's google_maps
 * `place` engine. Returns null on any failure (network, parse, empty
 * data) — caller decides whether to treat as fatal or graceful skip.
 *
 * Cost: ~$0.0075 per call. Bolt onto every CMA run for all top
 * competitors (cheap relative to the deliverable quality uplift).
 */
export async function fetchCompetitorCategories(
  cid: string,
  primaryTypeDisplay: string | null = null,
): Promise<CompetitorCategories | null> {
  const apiKey = process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error("SERPAPI_KEY not set");

  const url = new URL("https://serpapi.com/search");
  url.searchParams.set("engine", "google_maps");
  url.searchParams.set("type", "place");
  url.searchParams.set("data_cid", cid);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.warn(`SerpAPI google_maps fetch failed for CID ${cid} (${res.status})`);
    return null;
  }

  const data = (await res.json()) as Record<string, unknown>;
  const place = (data.place_results || {}) as Record<string, unknown>;
  // SerpAPI labels this field `type` (singular) but it's actually an array
  // of display names for the place's full category list.
  const types = (place.type || []) as string[];
  const typeIds = (place.type_ids || []) as string[];
  if (!Array.isArray(types) || !Array.isArray(typeIds) || types.length === 0 || typeIds.length !== types.length) {
    return null;
  }

  const gcids = typeIds.map((id) => `gcid:${id}`);
  let primaryGcid: string | null = null;
  if (primaryTypeDisplay) {
    const idx = types.findIndex((t) => t.toLowerCase() === primaryTypeDisplay.toLowerCase());
    if (idx >= 0) primaryGcid = gcids[idx];
  }

  return {
    cid,
    title: (place.title as string) || "",
    gcids,
    displayNames: types,
    primaryGcid,
  };
}
