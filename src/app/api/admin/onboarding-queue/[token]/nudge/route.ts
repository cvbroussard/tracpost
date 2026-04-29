/**
 * POST /api/admin/onboarding-queue/[token]/nudge
 * Body: { template_key: string, custom_note?: string }
 *
 * Operator-triggered help nudge. Sends an email to the subscriber AND
 * inserts a notification row that surfaces in the studio bell. The
 * notification persists until dismissed, so it shows up whenever the
 * subscriber next reaches the studio (independent of when the operator
 * sent it).
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getByToken } from "@/lib/onboarding/queries";
import { getNudgeTemplate } from "@/lib/onboarding/nudges/templates";
import { sendEmail } from "@/lib/email";
import { emailLayout } from "@/lib/email-layout";

interface Body {
  template_key?: string;
  custom_note?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = (await req.json().catch(() => ({}))) as Body;
  const { template_key, custom_note } = body;

  if (!template_key) {
    return NextResponse.json({ error: "template_key required" }, { status: 400 });
  }

  const template = getNudgeTemplate(template_key);
  if (!template) {
    return NextResponse.json({ error: "Unknown template" }, { status: 404 });
  }

  const submission = await getByToken(token);
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  const [owner] = await sql`
    SELECT id, email, name FROM users
    WHERE subscription_id = ${submission.subscription_id} AND role = 'owner'
    LIMIT 1
  `;
  if (!owner?.email) {
    return NextResponse.json({ error: "No owner email on file" }, { status: 400 });
  }

  const customNoteHtml = custom_note
    ? `<p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin: 18px 0 0; padding: 14px 16px; background: #f9fafb; border-radius: 8px; border-left: 3px solid #1a1a1a;"><em>${escapeHtml(custom_note)}</em></p>`
    : "";

  const emailBody = `
    <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
      ${escapeHtml(template.title)}
    </h1>
    ${template.bodyHtml}
    ${customNoteHtml}
  `;

  let emailSent = false;
  try {
    emailSent = await sendEmail({
      to: owner.email as string,
      subject: template.subject,
      html: emailLayout({
        preheader: template.notificationBody,
        body: emailBody,
      }),
    });
  } catch (err) {
    console.error("Nudge email failed:", err);
  }

  await sql`
    INSERT INTO notifications (
      subscription_id, category, severity, title, body, metadata
    ) VALUES (
      ${submission.subscription_id},
      'onboarding',
      'info',
      ${template.notificationTitle},
      ${template.notificationBody + (custom_note ? `\n\nNote from your TracPost team: ${custom_note}` : "")},
      ${JSON.stringify({
        type: "operator_nudge",
        template_key: template.key,
        platform: template.platform,
        token,
        custom_note: custom_note || null,
      })}
    )
  `;

  await sql`
    INSERT INTO usage_log (subscription_id, action, metadata)
    VALUES (${submission.subscription_id}, 'onboarding_nudge_sent', ${JSON.stringify({
      template_key: template.key,
      platform: template.platform,
      email_sent: emailSent,
    })})
  `;

  return NextResponse.json({
    success: true,
    email_sent: emailSent,
    template_key: template.key,
    platform: template.platform,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
