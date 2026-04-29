/**
 * POST /api/admin/onboarding-queue/[token]/complete
 *
 * Operator marks an onboarding submission complete. Sets completed_at
 * which removes it from the queue. Sends a final "you're live" email.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { markCompleted, getByToken } from "@/lib/onboarding/queries";
import { generateMagicToken } from "@/lib/magic-link";
import { sendEmail } from "@/lib/email";
import { emailLayout, ctaButton } from "@/lib/email-layout";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const submission = await getByToken(token);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }
  if (submission.completed_at) {
    return NextResponse.json({ error: "Already completed" }, { status: 409 });
  }
  if (!submission.submitted_at) {
    return NextResponse.json(
      { error: "Submission not yet submitted by subscriber" },
      { status: 400 }
    );
  }

  const updated = await markCompleted(token);
  if (!updated) {
    return NextResponse.json({ error: "Failed to mark complete" }, { status: 500 });
  }

  const [owner] = await sql`
    SELECT id, email, name FROM users
    WHERE subscription_id = ${submission.subscription_id} AND role = 'owner'
    LIMIT 1
  `;

  if (owner?.id && owner?.email) {
    try {
      const magicToken = await generateMagicToken(owner.id as string);
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://tracpost.com";
      const magicUrl = `${baseUrl}/auth/magic?token=${magicToken}`;

      const body = `
        <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
          Your TracPost studio is live
        </h1>
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
          Provisioning is complete. Your dashboard is open and ready — content scheduling will
          start producing posts as soon as the first photos come in from the field.
        </p>
        ${ctaButton({ href: magicUrl, label: "Open your studio" })}
      `;

      await sendEmail({
        to: owner.email as string,
        subject: "Your TracPost studio is live",
        html: emailLayout({
          preheader: "Provisioning is done. Your TracPost studio is ready.",
          body,
        }),
      });
    } catch (err) {
      console.error("Studio-live email failed (non-fatal):", err);
    }
  }

  await sql`
    INSERT INTO usage_log (subscription_id, action, metadata)
    VALUES (${submission.subscription_id}, 'onboarding_completed', ${JSON.stringify({
      token,
      operator_action: true,
    })})
  `;

  return NextResponse.json({ success: true, completed_at: updated.completed_at });
}
