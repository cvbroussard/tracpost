/**
 * POST /api/onboarding/[token]/submit
 *
 * Marks the submission as complete from the subscriber's side and sends
 * a welcome email with a magic link so they can reach their dashboard
 * without setting a password.
 *
 * Operator picks up the submission from the queue (Phase 6) to do
 * provisioning work (DNS, brand DNA review, etc.) and then marks it
 * `completed_at` once the studio is ready.
 */
import { NextRequest, NextResponse } from "next/server";
import { getByToken, isExpired, markSubmitted } from "@/lib/onboarding/queries";
import { generateMagicToken } from "@/lib/magic-link";
import { sendWelcomeEmail } from "@/lib/email";
import { sql } from "@/lib/db";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const submission = await getByToken(token);
  if (!submission) {
    return NextResponse.json({ error: "Onboarding link not found" }, { status: 404 });
  }
  if (isExpired(submission)) {
    return NextResponse.json({ error: "Onboarding link expired" }, { status: 410 });
  }
  if (submission.submitted_at) {
    return NextResponse.json({ error: "Already submitted" }, { status: 409 });
  }

  const data = submission.data as Record<string, unknown>;
  if (!data.business_name || !data.owner_email) {
    return NextResponse.json({
      error: "Form is missing required fields. Please complete all steps first.",
    }, { status: 400 });
  }

  const updated = await markSubmitted(token);
  if (!updated) {
    return NextResponse.json({ error: "Failed to submit" }, { status: 500 });
  }

  const [owner] = await sql`
    SELECT id, email, name FROM users
    WHERE subscription_id = ${submission.subscription_id} AND role = 'owner'
    LIMIT 1
  `;

  let magicSent = false;
  if (owner?.id && owner?.email) {
    try {
      const magicToken = await generateMagicToken(owner.id as string);
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tracpost.com";
      const magicUrl = `${baseUrl}/auth/magic?token=${magicToken}`;
      magicSent = await sendWelcomeEmail(owner.email as string, magicUrl, true);
    } catch (err) {
      console.error("Welcome email send failed (non-fatal):", err);
    }
  }

  // TODO Phase 6: notify operator queue (email/Slack/in-app)

  const response = NextResponse.json({
    success: true,
    submitted_at: updated.submitted_at,
    welcome_sent: magicSent,
    owner_email: owner?.email || null,
  });

  // Clear the onboarding-token cookie — visitor is no longer mid-onboarding,
  // so the marketing-bounce middleware should stop redirecting them.
  response.cookies.set("tp_onboarding_token", "", { maxAge: 0, path: "/" });

  return response;
}
