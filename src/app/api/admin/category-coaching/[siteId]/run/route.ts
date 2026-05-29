import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — accommodates CMA auto-trigger + coaching

/**
 * POST /api/admin/category-coaching/[siteId]/run
 *
 * Trigger a fresh GBP categories coaching ceremony for the site.
 *
 * Enforces the β rule: if no completed CMA with Tier 2 data exists,
 * auto-triggers a CMA and waits for completion before coaching. The
 * full pipeline (CMA + Tier 2 + coaching) takes ~60-120 seconds on
 * the long tail.
 *
 * Response (immediate):
 *   { runId, status: 'running' }
 *
 * Client polls GET endpoint for completion.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  if (!await isAdminRequest()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = await params;

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
