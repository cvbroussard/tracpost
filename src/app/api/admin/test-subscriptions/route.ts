/**
 * POST /api/admin/test-subscriptions/wipe-all
 *
 * Bulk-wipe ALL is_test=true subscriptions. Requires typed confirmation
 * via body { confirm: "WIPE" }. Operator-only.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import { wipeSubscription } from "@/lib/subscription-wipe";

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  if (body.confirm !== "WIPE") {
    return NextResponse.json(
      { error: "Bulk wipe requires body { confirm: \"WIPE\" } as a typed safety check." },
      { status: 400 }
    );
  }

  const rows = await sql`SELECT id FROM subscriptions WHERE is_test = true`;

  const results: Array<{ id: string; success: boolean; error: string | null }> = [];
  for (const row of rows) {
    const r = await wipeSubscription(row.id as string, {
      reason: "test_cleanup",
      operatorId: "operator",
      notes: "bulk wipe",
    });
    results.push({
      id: row.id as string,
      success: !r.error,
      error: r.error,
    });
  }

  const successes = results.filter((r) => r.success).length;
  const failures = results.length - successes;

  return NextResponse.json({
    success: failures === 0,
    wiped: successes,
    failed: failures,
    results,
  });
}
