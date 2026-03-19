import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateMagicToken } from "@/lib/magic-link";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/auth/forgot-password
 *
 * Sends a magic link to reset password. The subscriber clicks it,
 * lands in the dashboard, and changes their password from My Account.
 *
 * Always returns success (don't leak whether email exists).
 */
export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  // Look up subscriber — don't reveal if not found
  const [subscriber] = await sql`
    SELECT id FROM subscribers WHERE email = ${email} AND is_active = true
  `;

  if (subscriber) {
    const token = await generateMagicToken(subscriber.id as string);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tracpost.com";
    const magicUrl = `${baseUrl}/auth/magic?token=${token}`;

    await sendEmail({
      to: email,
      subject: "Reset your TracPost password",
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">
            Reset your password
          </h1>
          <p style="font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 24px;">
            Click the link below to sign in. Once in your dashboard, go to My Account to set a new password.
          </p>
          <a href="${magicUrl}" style="display: inline-block; background: #3b82f6; color: #fff; padding: 12px 24px; font-size: 15px; font-weight: 500; text-decoration: none; border-radius: 2px;">
            Sign in to TracPost
          </a>
          <p style="font-size: 13px; color: #9ca3af; margin-top: 32px;">
            This link expires in 7 days. If you didn't request this, you can ignore this email.
          </p>
        </div>
      `,
    });
  }

  // Always return success
  return NextResponse.json({ sent: true });
}
