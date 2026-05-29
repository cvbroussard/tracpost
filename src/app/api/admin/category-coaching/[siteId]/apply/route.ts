import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { applyCoachingRun } from "@/lib/competitive-intel/category-coaching-runner";

export const runtime = "nodejs";

/**
 * POST /api/admin/category-coaching/[siteId]/apply
 *
 * Apply a specific coaching run to the site's GBP categories. Replaces
 * site_gbp_categories with the plan (excluding 'drop' actions), marks
 * gbp_sync_dirty=true. Does NOT push to Google inline — relies on the
 * existing dirty-flag-then-sync pattern (#118).
 *
 * Body:
 *   { runId: string }
 *
 * Response:
 *   { applied: number, primaryGcid: string | null }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!await isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await params; // siteId not used directly — runId carries site context

  let runId: string | null = null;
  try {
    const body = (await req.json()) as { runId?: string };
    runId = body.runId || null;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!runId) {
    return NextResponse.json({ error: "runId required in body" }, { status: 400 });
  }

  try {
    const result = await applyCoachingRun(runId, "operator");
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Apply failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
