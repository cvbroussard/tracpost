import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/google/places-search?q=Pittsburgh
 *
 * Returns autocomplete predictions for any Google Place — establishments,
 * cities, neighborhoods, townships, ZIPs, colloquial regions, addresses,
 * etc. Same call shape regardless of caller.
 *
 * The legacy `type=address` param is preserved as a no-op for backwards
 * compatibility; previously it gated whether to apply a 5-type filter. The
 * filter capped predictions at admin-only types and silently dropped
 * colloquial_area names like "Squirrel Hill" and "Northwestern Pennsylvania."
 * Subscribers preferred the broader unfiltered behavior of the address mode,
 * so the default mode now matches it.
 *
 * Uses Google Places API (New) — Autocomplete endpoint, US region restricted.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q");
  const type = url.searchParams.get("type"); // "address" | null
  if (!query || query.length < 3) {
    return NextResponse.json({ predictions: [] });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return NextResponse.json({
      predictions: [
        { placeId: `manual_${query.replace(/\s+/g, "_").toLowerCase()}`, placeName: query },
      ],
    });
  }

  try {
    // Call Google with no type filter (covers all geographic types — Google
    // caps includedPrimaryTypes at 5 and a smaller set silently drops valid
    // declarations like colloquial_area). languageCode pins predictions to
    // English so subscribers don't see "Pensilvânia, USA" alongside
    // "Pennsylvania, USA". Filtering happens client-side below since
    // Places (New) Autocomplete doesn't support excludedPrimaryTypes.
    void type;
    const res = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
        body: JSON.stringify({
          input: query,
          includedRegionCodes: ["us"],
          languageCode: "en",
        }),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ predictions: [] });
    }

    // Whitelist filter: keep only predictions that include at least one
    // known geographic type. Drops establishments, businesses, schools,
    // libraries, restaurants, streets, addresses, plus_codes, etc. without
    // having to enumerate every business sub-type Google can emit.
    const GEOGRAPHIC_TYPES = new Set([
      "locality",
      "sublocality",
      "sublocality_level_1",
      "sublocality_level_2",
      "sublocality_level_3",
      "sublocality_level_4",
      "sublocality_level_5",
      "neighborhood",
      "colloquial_area",
      "postal_code",
      "postal_code_prefix",
      "postal_code_suffix",
      "administrative_area_level_1",
      "administrative_area_level_2",
      "administrative_area_level_3",
      "administrative_area_level_4",
      "administrative_area_level_5",
      "country",
    ]);

    const data = await res.json();
    const predictions = ((data.suggestions || []) as Array<Record<string, unknown>>)
      .filter((s) => s.placePrediction)
      .map((s) => s.placePrediction as { placeId: string; text: { text: string }; types?: string[] })
      .filter((pp) => (pp.types || []).some((t) => GEOGRAPHIC_TYPES.has(t)))
      .map((pp) => ({ placeId: pp.placeId, placeName: pp.text.text }));

    return NextResponse.json({ predictions });
  } catch {
    return NextResponse.json({ predictions: [] });
  }
}
