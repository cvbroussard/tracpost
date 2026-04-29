import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { otpGate } from "@/lib/otp-gate";

/**
 * POST /api/account/cancel — Request account cancellation.
 *
 * Body: { reason?: string, redirect_target?: string, otp_code?: string }
 *
 * Owner-only protected action — gated by email-OTP step-up. First call
 * without otp_code returns 401 + sends a 6-digit code to the owner's
 * email. Caller re-issues the call with otp_code to actually cancel.
 *
 * Sets cancelled_at on subscription. Grace period is 30 days.
 * If redirect_target is provided, sets up departure redirects for blog.
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  if (auth.role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const body = await req.json();
  const { reason, redirect_target, otp_code } = body;

  // Step-up auth: first call (no code) sends OTP; second call (with code) verifies.
  const otpFailure = await otpGate(auth.userId, "cancel_subscription", otp_code);
  if (otpFailure) return otpFailure;

  // Check if already cancelled
  const [subscriber] = await sql`
    SELECT id, cancelled_at FROM subscriptions WHERE id = ${auth.subscriptionId}
  `;
  if (!subscriber) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }
  if (subscriber.cancelled_at) {
    return NextResponse.json({
      error: "Account already cancelled",
      cancelled_at: subscriber.cancelled_at,
      grace_ends: graceEnd(subscriber.cancelled_at as string),
    }, { status: 409 });
  }

  // Set cancellation
  await sql`
    UPDATE subscriptions
    SET cancelled_at = NOW(),
        cancel_reason = ${reason || null},
        updated_at = NOW()
    WHERE id = ${auth.subscriptionId}
  `;

  // Disable autopilot on all sites
  await sql`
    UPDATE sites SET autopilot_enabled = false
    WHERE subscription_id = ${auth.subscriptionId}
  `;

  // Set up departure redirects if target provided
  if (redirect_target) {
    const sites = await sql`
      SELECT s.id, bs.subdomain, bs.custom_domain
      FROM sites s
      LEFT JOIN blog_settings bs ON bs.site_id = s.id
      WHERE s.subscription_id = ${auth.subscriptionId}
        AND bs.blog_enabled = true
    `;

    // Redirects active for 120 days (30 grace + 90 post-suspension)
    for (const site of sites) {
      if (site.subdomain || site.custom_domain) {
        await sql`
          INSERT INTO departure_redirects (site_id, target_base, active_until)
          VALUES (${site.id}, ${redirect_target}, NOW() + INTERVAL '120 days')
          ON CONFLICT DO NOTHING
        `;
      }
    }
  }

  const cancelledAt = new Date().toISOString();

  return NextResponse.json({
    success: true,
    cancelled_at: cancelledAt,
    grace_ends: graceEnd(cancelledAt),
    message: "Your account will remain active for 30 days. Export your data before then.",
    redirects_configured: !!redirect_target,
  });
}

/**
 * DELETE /api/account/cancel — Revoke cancellation (during grace period).
 */
export async function DELETE(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const [subscriber] = await sql`
    SELECT id, cancelled_at, is_active FROM subscriptions WHERE id = ${auth.subscriptionId}
  `;
  if (!subscriber) {
    return NextResponse.json({ error: "Subscription not found" }, { status: 404 });
  }
  if (!subscriber.cancelled_at) {
    return NextResponse.json({ error: "Account is not cancelled" }, { status: 400 });
  }
  if (!subscriber.is_active) {
    return NextResponse.json({
      error: "Grace period has ended. Contact support to reactivate.",
    }, { status: 410 });
  }

  // Revoke cancellation
  await sql`
    UPDATE subscriptions
    SET cancelled_at = NULL, cancel_reason = NULL, updated_at = NOW()
    WHERE id = ${auth.subscriptionId}
  `;

  // Remove departure redirects
  const siteIds = await sql`
    SELECT id FROM sites WHERE subscription_id = ${auth.subscriptionId}
  `;
  for (const site of siteIds) {
    await sql`
      DELETE FROM departure_redirects WHERE site_id = ${site.id}
    `;
  }

  return NextResponse.json({
    success: true,
    message: "Cancellation revoked. Your account is fully active.",
  });
}

function graceEnd(cancelledAt: string): string {
  const d = new Date(cancelledAt);
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}
