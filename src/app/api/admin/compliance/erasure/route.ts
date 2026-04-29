/**
 * POST /api/admin/compliance/erasure
 * Body: { subscription_id, request_reference, exemption_notes?, confirm: "ERASE" }
 *
 * Operator-only compliance escape hatch for GDPR Article 17 / CCPA right-
 * to-delete requests. Same DB cascade as test-subscription wipe but with
 * different reason + audit metadata.
 *
 * Stripe customer is NOT deleted (we retain billing records for required
 * financial-retention exemption). Only the subscription cascade fires.
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
  const { subscription_id, request_reference, exemption_notes, confirm } = body;

  if (confirm !== "ERASE") {
    return NextResponse.json(
      { error: "Compliance erasure requires body { confirm: \"ERASE\" } as a typed safety check." },
      { status: 400 }
    );
  }

  if (!subscription_id || typeof subscription_id !== "string") {
    return NextResponse.json({ error: "subscription_id required" }, { status: 400 });
  }

  if (!request_reference || typeof request_reference !== "string") {
    return NextResponse.json(
      {
        error:
          "request_reference required — typically a legal hold ID, ticket number, or request date.",
      },
      { status: 400 }
    );
  }

  const [sub] = await sql`SELECT id, is_test FROM subscriptions WHERE id = ${subscription_id}`;
  if (!sub) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }

  // Compliance erasure should be used for live subscribers only.
  // Test subscriptions go through /admin/test-subscriptions instead.
  if (sub.is_test === true) {
    return NextResponse.json(
      {
        error:
          "This is a test subscription. Use /admin/test-subscriptions for synthetic cleanup instead.",
      },
      { status: 400 }
    );
  }

  const result = await wipeSubscription(subscription_id, {
    reason: "compliance_erasure",
    operatorId: "operator",
    notes: `Request: ${request_reference}${exemption_notes ? ` | Notes: ${exemption_notes}` : ""}`,
  });

  if (result.error) {
    return NextResponse.json({ ...result, error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...result });
}
