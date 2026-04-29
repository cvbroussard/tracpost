/**
 * POST /api/onboarding/resend
 * Body: { email }
 *
 * Resends the onboarding form link. If the subscriber has an unsubmitted
 * onboarding (even expired), we generate a fresh token + extend expiry,
 * then email it to the owner. Always returns success to avoid leaking
 * email existence.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateOnboardingToken, onboardingUrl } from "@/lib/onboarding/token";
import { sendEmail } from "@/lib/email";
import { emailLayout, ctaButton } from "@/lib/email-layout";

const FRESH_TTL_DAYS = 30;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.toLowerCase().trim() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return NextResponse.json({ sent: true });
  }

  const [row] = await sql`
    SELECT os.id, os.token, os.subscription_id, u.name AS owner_name
    FROM onboarding_submissions os
    JOIN users u ON u.subscription_id = os.subscription_id AND u.role = 'owner'
    WHERE u.email = ${email}
      AND os.submitted_at IS NULL
      AND os.completed_at IS NULL
    ORDER BY os.created_at DESC
    LIMIT 1
  `;

  if (row) {
    const newToken = generateOnboardingToken();
    const newExpiry = new Date(Date.now() + FRESH_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    await sql`
      UPDATE onboarding_submissions
      SET token = ${newToken},
          expires_at = ${newExpiry},
          updated_at = NOW()
      WHERE id = ${row.id}
    `;

    const url = onboardingUrl(newToken);
    const ownerName = (row.owner_name as string) || "there";

    const body = `
      <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
        Hi ${ownerName} — here&apos;s your onboarding link
      </h1>
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
        Pick up where you left off. The link below works for ${FRESH_TTL_DAYS} days.
      </p>
      ${ctaButton({ href: url, label: "Continue onboarding" })}
      <p style="font-size: 12px; color: #9ca3af; line-height: 1.5; margin: 16px 0 0; text-align: center;">
        If you didn&apos;t request this email, you can safely ignore it.
      </p>
    `;

    try {
      await sendEmail({
        to: email,
        subject: "Your TracPost onboarding link",
        html: emailLayout({
          preheader: "Pick up your TracPost onboarding where you left off.",
          body,
        }),
      });
    } catch (err) {
      console.error("Onboarding resend email failed:", err);
    }
  }

  return NextResponse.json({ sent: true });
}
