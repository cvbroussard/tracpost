import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  getLatestStrategicRecommendation,
  assessStaleness,
} from "@/lib/brand-identity/statistical-recommendation";

export const runtime = "nodejs";

/**
 * GET /api/admin/strategic-recommendation/[siteId]
 *
 * Returns the most recent persisted strategic recommendation for a
 * business (any owner_action state) PLUS a staleness assessment
 * comparing the rec's source CMA to the latest CMA.
 *
 * Staleness compares only STRUCTURAL fields (GBP categories, service
 * areas, commercial tier) — SERP-layer churn from periodic CMA
 * re-runs does NOT trigger staleness.
 *
 * Response:
 *   {
 *     recommendation: PersistedStrategicRecommendation | null,
 *     staleness: StalenessAssessment | null
 *   }
 *   staleness is null when no recommendation exists or when no CMA
 *   exists for comparison.
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
  const staleness = recommendation ? await assessStaleness(siteId, recommendation.cmaId) : null;

  return NextResponse.json({ recommendation, staleness });
}
