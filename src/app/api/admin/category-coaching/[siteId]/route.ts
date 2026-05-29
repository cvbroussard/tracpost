import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { getLatestCoachingRun } from "@/lib/competitive-intel/category-coaching-runner";

export const runtime = "nodejs";

/**
 * GET /api/admin/category-coaching/[siteId]
 *
 * Returns the latest category coaching run for the site (any status).
 * Used by the operator UI to render the current plan + poll for
 * completion during a run.
 *
 * Response:
 *   { run: null }  — no coaching has been run for this site yet
 *   { run: { id, status, ... } }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  if (!await isAdminRequest()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = await params;
  const run = await getLatestCoachingRun(siteId);
  return NextResponse.json({ run });
}
