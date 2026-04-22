import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/google/places-search?q=Pittsburgh
 * Returns place predictions for service area selection.
 * Uses Google Places API (New) — Autocomplete endpoint, regions only.
 */
export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get("q");
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
    const res = await fetch(
      "https://places.googleapis.com/v1/places:autocomplete",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify({
          input: query,
          includedPrimaryTypes: ["locality", "sublocality", "administrative_area_level_1", "administrative_area_level_2"],
          includedRegionCodes: ["us"],
        }),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ predictions: [] });
    }

    const data = await res.json();
    const predictions = (data.suggestions || [])
      .filter((s: Record<string, unknown>) => s.placePrediction)
      .map((s: { placePrediction: { placeId: string; text: { text: string } } }) => ({
        placeId: s.placePrediction.placeId,
        placeName: s.placePrediction.text.text,
      }));

    return NextResponse.json({ predictions });
  } catch {
    return NextResponse.json({ predictions: [] });
  }
}
