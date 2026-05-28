import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateMagicToken } from "@/lib/magic-link";
import { sendWelcomeEmail } from "@/lib/email";

/**
 * POST /api/auth/magic-link
 * Body: { email }
 *
 * Sends a magic link sign-in email. Always returns success to avoid
 * leaking whether the email exists.
 */
export async function POST(req: NextRequest) {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ sent: true });
  }

  const [subscriber] = await sql`
    SELECT id FROM users
    WHERE email = ${email} AND is_active = true
  `;

  if (subscriber) {
    const token = await generateMagicToken(subscriber.id as string);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL
      || (process.env.NODE_ENV === "production" ? "https://studio.tracpost.com" : "http://localhost:3000");
    const magicUrl = `${baseUrl}/auth/magic?token=${token}`;

    await sendWelcomeEmail(email, magicUrl, false);
  }

  // Always return success — don't leak email existence
  return NextResponse.json({ sent: true });
}
