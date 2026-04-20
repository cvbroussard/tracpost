import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/google/performance?site_id=xxx
 * Fetch GBP performance metrics for the Performance tab.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const { fetchPerformance } = await import("@/lib/gbp/performance");
  const data = await fetchPerformance(siteId);

  if (!data) {
    return NextResponse.json({ error: "No active GBP connection" }, { status: 404 });
  }

  return NextResponse.json(data);
}
