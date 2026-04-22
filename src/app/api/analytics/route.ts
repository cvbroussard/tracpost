import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/analytics?site_id=xxx&report=overview|acquisition|pages|trend|geography|devices|attribution
 * Fetches GA4 analytics data for the specified report type.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;

  const params = new URL(req.url).searchParams;
  const siteId = params.get("site_id");
  const report = params.get("report") || "overview";
  const days = parseInt(params.get("days") || "30", 10);

  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  try {
    const ga4 = await import("@/lib/ga4/analytics");

    let data: unknown = null;

    switch (report) {
      case "overview":
        data = await ga4.fetchOverview(siteId, days);
        break;
      case "acquisition":
        data = await ga4.fetchAcquisition(siteId, days);
        break;
      case "pages":
        data = await ga4.fetchTopPages(siteId, days);
        break;
      case "trend":
        data = await ga4.fetchTrafficTrend(siteId, days);
        break;
      case "geography":
        data = await ga4.fetchGeography(siteId, days);
        break;
      case "devices":
        data = await ga4.fetchDevices(siteId, days);
        break;
      case "attribution":
        data = await ga4.fetchTracPostAttribution(siteId, days);
        break;
      default:
        return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: "No GA4 data available. Analytics may take 24-48 hours to start reporting." }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error("Analytics API error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
