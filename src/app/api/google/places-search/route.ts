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
    // No type filter: returns everything Google returns (establishments,
    // street addresses, townships, ZIPs, neighborhoods, colloquial regions,
    // cities, counties, states, etc.). Matches the behavior subscribers
    // already validated via the LocationPicker (type=address) flow.
    //
    // Trade-off accepted: noise (e.g., "Mt. Lebanon Public Library" alongside
    // "Mt. Lebanon, PA"). Breadth wins because Google's includedPrimaryTypes
    // caps at 5 — any restricted set silently drops valid declarations like
    // colloquial_area regions ("Northwestern Pennsylvania") and informal
    // neighborhood names ("Squirrel Hill"). The `type` param is preserved
    // for backwards compatibility with existing callers but is now a no-op.
    void type;
    const res = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
        body: JSON.stringify({ input: query, includedRegionCodes: ["us"] }),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ predictions: [] });
    }

    const data = await res.json();
    const predictions = ((data.suggestions || []) as Array<Record<string, unknown>>)
      .filter((s) => s.placePrediction)
      .map((s) => {
        const pp = s.placePrediction as { placeId: string; text: { text: string } };
        return { placeId: pp.placeId, placeName: pp.text.text };
      });

    return NextResponse.json({ predictions });
  } catch {
    return NextResponse.json({ predictions: [] });
  }
}
