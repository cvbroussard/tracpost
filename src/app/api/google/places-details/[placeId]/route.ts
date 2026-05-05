import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET /api/google/places-details/:placeId
 *
 * Pairs with the existing /api/google/places-search autocomplete to
 * complete the two-step Google Places integration:
 *
 *   1. Autocomplete:  /api/google/places-search?q=Pittsb...
 *      → predictions: [{ placeId, placeName }]
 *   2. THIS endpoint: /api/google/places-details/:placeId
 *      → { latitude, longitude, formattedAddress, placeId, placeName }
 *
 * The lat/lon flows into:
 *   - The Reach step's map (re-center + redraw radius circle)
 *   - Meta API payload at Trigger time (custom_locations.latitude/longitude)
 *   - Persisted to sites.place_id / place_lat / place_lon if subscriber
 *     promotes the override to canonical (separate flow)
 *
 * Uses Google Places API (New) Place Details endpoint with FieldMask
 * limited to just location + formatted address (cheaper than the
 * default broad fieldset).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ placeId: string }> },
) {
  const { placeId } = await params;
  if (!placeId) {
    return NextResponse.json({ error: "placeId required" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Google API key not configured" },
      { status: 503 },
    );
  }

  // Manual placeholder placeIds (when the autocomplete API was unavailable
  // and the route returned a synthetic { placeId: "manual_..." }) cannot
  // be resolved here — surface a clear error so the UI can fall back.
  if (placeId.startsWith("manual_")) {
    return NextResponse.json(
      { error: "Manual placeId cannot be resolved to coordinates" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        method: "GET",
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "id,location,formattedAddress,displayName",
        },
      },
    );

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return NextResponse.json(
        {
          error: "Place Details lookup failed",
          status: res.status,
          detail: errBody.slice(0, 200),
        },
        { status: 502 },
      );
    }

    const data = await res.json();
    const lat = data?.location?.latitude;
    const lon = data?.location?.longitude;

    if (typeof lat !== "number" || typeof lon !== "number") {
      return NextResponse.json(
        { error: "Place has no resolvable coordinates" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      placeId: data.id || placeId,
      latitude: lat,
      longitude: lon,
      formattedAddress: data.formattedAddress || null,
      placeName: data.displayName?.text || data.formattedAddress || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Place Details fetch failed", message },
      { status: 502 },
    );
  }
}
