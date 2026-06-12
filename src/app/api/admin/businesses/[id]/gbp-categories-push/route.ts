/**
 * Admin-scoped GBP categories push — commits the local categories cache
 * (business_gbp_categories rows) to Google.
 *
 * Per the 2026-06-11 step 14 role-split audit: categories are operator-
 * owned (write authority). This endpoint is the operator's "push to
 * Google" action from the step 14 drawer.
 *
 * Mirrors the dirty-flag-then-sync pattern: the local rows are authoritative
 * for what gets pushed. After successful push, the operator UI refreshes
 * its local view to reflect Google's normalized echo.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  try {
    const { pushCategoriesToGoogle } = await import("@/lib/gbp/profile");
    const result = await pushCategoriesToGoogle(id);
    return NextResponse.json(result, { status: result.success ? 200 : 500 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Push failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
