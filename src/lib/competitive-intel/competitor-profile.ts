/**
 * Read a competitor's public Google Places profile.
 *
 * Once we've identified ranking competitors by place_id (from SERP
 * extraction), this fetches each competitor's public GBP-equivalent
 * profile data: primary type (gcid), additional types, address,
 * website, review count + rating.
 *
 * Used downstream by the comparison engine to surface the diff
 * ("their primary category is X, you have Y") — a key element of
 * the competitive analysis artifact.
 *
 * Uses Google Places API (New) — same key as the rest of GBP
 * integration (GOOGLE_PLACES_API_KEY).
 *
 * Field selection rationale: we want what informs the competitive
 * comparison without pulling expensive fields (photos, reviews text,
 * editorial summary). The cheap field set is sub-$0.002/lookup.
 */
const FIELD_MASK = [
  "id",
  "displayName",
  "primaryType",
  "primaryTypeDisplayName",
  "types",
  "formattedAddress",
  "websiteUri",
  "internationalPhoneNumber",
  "rating",
  "userRatingCount",
  "businessStatus",
].join(",");

export interface CompetitorProfile {
  placeId: string;
  displayName: string;
  /** Primary type from Google's taxonomy (often the gcid:* form for GBP listings) */
  primaryType: string | null;
  /** Human-readable display of the primary type (e.g., "General contractor") */
  primaryTypeDisplay: string | null;
  /** Full array of types this place has */
  types: string[];
  formattedAddress: string | null;
  websiteUri: string | null;
  phone: string | null;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  /** Whether this fetch failed or succeeded — null fields mean no data, not absent */
  status: "ok" | "not_found" | "error";
  errorMessage?: string;
}

/**
 * Fetch a single competitor profile by place_id.
 */
export async function fetchCompetitorProfile(
  placeId: string,
): Promise<CompetitorProfile> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return errorProfile(placeId, "GOOGLE_PLACES_API_KEY not set");
  }

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
      },
    );

    if (res.status === 404) {
      return { ...emptyProfile(placeId), status: "not_found" };
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return errorProfile(placeId, `Places API ${res.status}: ${body.slice(0, 120)}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    return parseCompetitorProfile(placeId, data);
  } catch (err) {
    return errorProfile(placeId, err instanceof Error ? err.message : String(err));
  }
}

/**
 * Fetch a batch of competitor profiles in parallel.
 * Returns results in the same order as input placeIds.
 *
 * Concurrency cap of 10 — Places API is generous on rate limits but
 * we don't want to spike if we're fetching 50+ competitors.
 */
export async function fetchCompetitorProfiles(
  placeIds: string[],
): Promise<CompetitorProfile[]> {
  const CONCURRENCY = 10;
  const results: CompetitorProfile[] = new Array(placeIds.length);
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= placeIds.length) return;
      results[i] = await fetchCompetitorProfile(placeIds[i]);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, placeIds.length) }, worker);
  await Promise.all(workers);

  return results;
}

/**
 * Parse Places API response into a CompetitorProfile.
 * Exported for unit testing against mock data.
 */
export function parseCompetitorProfile(
  placeId: string,
  data: Record<string, unknown>,
): CompetitorProfile {
  const displayName = (data.displayName as { text?: string })?.text || "";
  return {
    placeId,
    displayName,
    primaryType: (data.primaryType as string) || null,
    primaryTypeDisplay: (data.primaryTypeDisplayName as { text?: string })?.text || null,
    types: (data.types as string[]) || [],
    formattedAddress: (data.formattedAddress as string) || null,
    websiteUri: (data.websiteUri as string) || null,
    phone: (data.internationalPhoneNumber as string) || null,
    rating: (data.rating as number) ?? null,
    reviewCount: (data.userRatingCount as number) ?? null,
    businessStatus: (data.businessStatus as string) || null,
    status: "ok",
  };
}

function emptyProfile(placeId: string): CompetitorProfile {
  return {
    placeId,
    displayName: "",
    primaryType: null,
    primaryTypeDisplay: null,
    types: [],
    formattedAddress: null,
    websiteUri: null,
    phone: null,
    rating: null,
    reviewCount: null,
    businessStatus: null,
    status: "ok",
  };
}

function errorProfile(placeId: string, message: string): CompetitorProfile {
  return { ...emptyProfile(placeId), status: "error", errorMessage: message };
}
