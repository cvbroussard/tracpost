import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { checkCmaReadiness } from "@/lib/competitive-intel/category-coaching-runner";

export const runtime = "nodejs";
export const maxDuration = 120; // coaching only; CMA must be pre-run by operator

/**
 * POST /api/admin/category-coaching/[siteId]/run
 *
 * Trigger a fresh GBP categories coaching ceremony for the site.
 *
 * Manual-before-autopilot (2026-06-16): no auto-trigger of CMA. If no
 * completed CMA with Tier 2 data exists, returns 412 Precondition
 * Failed with code `cma_required` so the UI can render a blocker
 * pointing the operator at /ops/competitive-analysis. Auto-trigger
 * may return later as an explicit autopilot capability.
 *
 * Synchronous pre-check: if blocker, no run row inserted. If ready,
 * inserts run row at status='running', returns 202, work happens in
 * background via Vercel waitUntil; client polls GET for completion.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  if (!await isAdminRequest()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = await params;

  // Synchronous CMA readiness check — UI gets the blocker immediately.
  const blocker = await checkCmaReadiness(siteId);
  if (blocker) {
    return NextResponse.json(
      { ok: false, error: "cma_required", code: blocker.code, message: blocker.message },
      { status: 412 },
    );
  }

  const { runCategoryCoachingForSite } = await import("@/lib/competitive-intel/category-coaching-runner");

  try {
    const { waitUntil } = await import("@vercel/functions");
    waitUntil(runCategoryCoachingForSite(siteId));
  } catch {
    runCategoryCoachingForSite(siteId).catch((err) => {
      console.error("Category coaching run failed:", err instanceof Error ? err.message : err);
    });
  }

  return NextResponse.json(
    { status: "running", siteId, message: "Coaching triggered. Poll GET endpoint for completion." },
    { status: 202 },
  );
}
