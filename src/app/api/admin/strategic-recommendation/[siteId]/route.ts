import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { getLatestStrategicRecommendation } from "@/lib/brand-identity/statistical-recommendation";

export const runtime = "nodejs";

/**
 * GET /api/admin/strategic-recommendation/[siteId]
 *
 * Returns the most recent persisted strategic recommendation for a
 * business (any owner_action state). Used by the review UI to render
 * an existing bundle without re-generating.
 *
 * Response:
 *   { recommendation: PersistedStrategicRecommendation } if one exists
 *   { recommendation: null }                              if none yet
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;
  const recommendation = await getLatestStrategicRecommendation(siteId);

  return NextResponse.json({ recommendation });
}
