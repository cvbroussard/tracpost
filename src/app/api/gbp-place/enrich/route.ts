import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { enrichPlace } from "@/lib/gbp/enrich-place";

/**
 * POST /api/gbp-place/enrich
 * Body: { place_id, place_name }
 *
 * Idempotent enrichment trigger. Called by the GBP profile page picker
 * when a subscriber adds a service area, and by syncProfileFromGoogle
 * defensively for any pulled place_id we don't already cache. Returns
 * 200 even when enrichment fails — this is a cache operation that
 * never blocks subscriber action.
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const { place_id, place_name } = await req.json();
  if (!place_id) {
    return NextResponse.json({ error: "place_id required" }, { status: 400 });
  }

  try {
    const enriched = await enrichPlace(place_id, place_name || "");
    return NextResponse.json({ enriched });
  } catch (err) {
    console.warn("Place enrichment failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ enriched: false });
  }
}
