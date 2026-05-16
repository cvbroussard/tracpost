import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — allows the SERP fetch loop to complete on long sites

/**
 * POST /api/admin/competitive-analysis/[siteId]/run
 *
 * Trigger a fresh competitive market analysis for the given site.
 *
 * The analysis runs 15-20 SerpAPI queries serially (~30-90 sec total)
 * + extracts ranking competitors + persists to competitive_market_analyses.
 * Response returns immediately with status='running'; client polls the
 * GET endpoint to detect completion.
 *
 * Body (optional):
 *   { maxQueries?: number, topN?: number }
 *
 * Response (immediate):
 *   { analysisId: string, status: 'running' }
 *
 * Async work uses Vercel's waitUntil so the request doesn't block on
 * the full pipeline. The pipeline status lifecycle (pending → running
 * → complete | failed) is observable via the GET endpoint.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;

  let opts: { maxQueries?: number; topN?: number } = {};
  try {
    opts = (await req.json()) as typeof opts;
  } catch {
    // No body is fine — defaults apply
  }

  const { runAnalysisForSite } = await import("@/lib/competitive-intel/analysis-assembly");

  // Fire the analysis async via waitUntil so the request returns fast.
  // runAnalysisForSite creates the row at status='running' as its first
  // step, then proceeds through SERP fetches. Failure modes are
  // captured in the row (status='failed' + error_message) for the GET
  // endpoint to surface.
  try {
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(runAnalysisForSite(siteId, opts));
  } catch {
    // @vercel/functions unavailable in some local dev — fall back to
    // dispatching without waiting. The fetch may time out from the
    // client's perspective, but the analysis still runs server-side.
    runAnalysisForSite(siteId, opts).catch((err) => {
      console.error("Analysis run failed:", err instanceof Error ? err.message : err);
    });
  }

  return NextResponse.json(
    { status: "running", siteId, message: "Analysis triggered. Poll GET endpoint for completion." },
    { status: 202 },
  );
}
