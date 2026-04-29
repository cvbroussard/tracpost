import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/admin/notify-ready
 *
 * Sends "You're live" email to subscriber when provisioning is complete.
 * Called by platform admin from provisioning console.
 */
export async function POST(req: NextRequest) {
  // Simple admin auth check
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subscription_id } = await req.json();
  if (!subscription_id) {
    return NextResponse.json({ error: "subscription_id required" }, { status: 400 });
  }

  const [subscriber] = await sql`
    SELECT u.name, u.email
    FROM users u
    WHERE u.subscription_id = ${subscription_id} AND u.role = 'owner'
  `;

  if (!subscriber?.email) {
    return NextResponse.json({ error: "Subscriber not found or no email" }, { status: 404 });
  }

  const appUrl = "https://testflight.apple.com/join/tracpost"; // TODO: Replace with App Store URL
  const dashboardUrl = "https://studio.tracpost.com";

  await sendEmail({
    to: subscriber.email as string,
    subject: `${subscriber.name}, your accounts are live`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">
          You're live
        </h1>
        <p style="font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 8px;">
          Your social accounts are set up and your content engine is ready. Here's what we've done for you:
        </p>
        <ul style="font-size: 15px; color: #4b5563; line-height: 1.8; margin-bottom: 24px; padding-left: 20px;">
          <li>Created and optimized your social profiles</li>
          <li>Generated your brand intelligence playbook</li>
          <li>Prepared your blog with initial content</li>
          <li>Connected your publishing pipeline</li>
        </ul>
        <p style="font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 24px;">
          <strong>Your only job now:</strong> capture photos and videos of your work. We handle everything else.
        </p>
        <div style="margin-bottom: 16px;">
          <a href="${appUrl}" style="display: inline-block; background: #3b82f6; color: #fff; padding: 12px 24px; font-size: 15px; font-weight: 500; text-decoration: none; border-radius: 2px;">
            Download TracPost Studio
          </a>
        </div>
        <div>
          <a href="${dashboardUrl}" style="display: inline-block; border: 1px solid #e5e7eb; color: #4b5563; padding: 10px 24px; font-size: 14px; text-decoration: none; border-radius: 2px;">
            Open Dashboard
          </a>
        </div>
      </div>
    `,
  });

  // Update onboarding status
  await sql`
    UPDATE subscriptions
    SET metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{onboarding_status}',
      '"provisioned"'::jsonb
    ),
    updated_at = NOW()
    WHERE id = ${subscription_id}
  `;

  await sql`
    INSERT INTO usage_log (subscription_id, action, metadata)
    VALUES (${subscription_id}, 'provisioning_complete', '{}')
  `;

  return NextResponse.json({ sent: true });
}
