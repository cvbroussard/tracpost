/**
 * DELETE /api/admin/test-subscriptions/[id]
 *
 * Wipes a single test subscription (full cascade + Stripe customer delete
 * for test rows). Operator-only. Refuses if `is_test = false`.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import { wipeSubscription } from "@/lib/subscription-wipe";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [sub] = await sql`SELECT id, is_test FROM subscriptions WHERE id = ${id}`;
  if (!sub) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }
  if (sub.is_test !== true) {
    return NextResponse.json(
      {
        error:
          "This subscription is not flagged as test. Use the compliance erasure tool instead.",
      },
      { status: 403 }
    );
  }

  const result = await wipeSubscription(id, {
    reason: "test_cleanup",
    operatorId: "operator",
  });

  if (result.error) {
    return NextResponse.json({ ...result, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...result });
}
