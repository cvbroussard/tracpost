import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { sendEmail } from "@/lib/email";

/**
 * POST /api/website/contact
 * Body: { site_id, name, email, phone, message, website }
 *   website = honeypot field (must be empty)
 *
 * Contact form submissions from tenant websites.
 * - Logs every submission to contact_submissions
 * - Forwards to tenant's business_email (reply-to set to visitor)
 * - Sends visitor confirmation email
 * - Honeypot + rate limit for spam
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { site_id, name, email, phone, message, website } = body;

  if (!site_id || !name || !email || !message) {
    return cors(NextResponse.json({ error: "site_id, name, email, message required" }, { status: 400 }));
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return cors(NextResponse.json({ error: "Invalid email" }, { status: 400 }));
  }

  // Honeypot — bots fill the "website" field, real users don't see it
  const isHoneypot = website && website.trim() !== "";

  // Rate limit — max 5 submissions from an IP in 10 minutes
  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("x-real-ip")
    || null;
  const userAgent = req.headers.get("user-agent") || null;
  const referer = req.headers.get("referer") || null;

  let rateLimited = false;
  if (ipAddress && !isHoneypot) {
    const [{ count }] = await sql`
      SELECT COUNT(*)::int AS count FROM contact_submissions
      WHERE ip_address = ${ipAddress}
        AND created_at > NOW() - INTERVAL '10 minutes'
    `;
    if (Number(count) >= 5) {
      rateLimited = true;
    }
  }

  const [site] = await sql`
    SELECT name, business_email FROM sites WHERE id = ${site_id} AND is_active = true
  `;
  if (!site) {
    return cors(NextResponse.json({ error: "Site not found" }, { status: 404 }));
  }

  const businessEmail = site.business_email as string;
  const siteName = site.name as string;

  // Log the submission (even spam/rate-limited for audit)
  const isSpam = isHoneypot || rateLimited;
  const spamReason = isHoneypot ? "honeypot" : rateLimited ? "rate_limit" : null;

  const [submission] = await sql`
    INSERT INTO contact_submissions (
      site_id, name, email, phone, message,
      ip_address, user_agent, referer,
      is_spam, spam_reason
    )
    VALUES (
      ${site_id}, ${name}, ${email}, ${phone || null}, ${message},
      ${ipAddress}, ${userAgent}, ${referer},
      ${isSpam}, ${spamReason}
    )
    RETURNING id
  `;
  const submissionId = submission.id as string;

  // If spam, return success silently so bots don't learn our detection
  if (isSpam) {
    return cors(NextResponse.json({ success: true }));
  }

  if (!businessEmail) {
    await sql`
      UPDATE contact_submissions
      SET email_error = 'Business email not configured'
      WHERE id = ${submissionId}
    `;
    return cors(NextResponse.json({ error: "Business email not configured" }, { status: 400 }));
  }

  // Send to tenant with replyTo = visitor email
  const sent = await sendEmail({
    to: businessEmail,
    replyTo: email,
    subject: `New contact from ${name} — ${siteName} website`,
    html: buildTenantEmail({ name, email, phone, message, siteName }),
  });

  if (!sent) {
    await sql`
      UPDATE contact_submissions
      SET email_error = 'Resend send failed'
      WHERE id = ${submissionId}
    `;
    return cors(NextResponse.json({ error: "Failed to send" }, { status: 500 }));
  }

  await sql`UPDATE contact_submissions SET email_sent = true WHERE id = ${submissionId}`;

  // Send visitor confirmation (fire-and-forget, don't fail if this fails)
  sendEmail({
    to: email,
    subject: `Thanks for contacting ${siteName}`,
    html: buildVisitorConfirmation({ name, siteName, message }),
  }).catch(() => { /* ignore */ });

  return cors(NextResponse.json({ success: true }));
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }));
}

function cors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTenantEmail({ name, email, phone, message, siteName }: {
  name: string; email: string; phone?: string; message: string; siteName: string;
}): string {
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size: 18px; margin-bottom: 16px; color: #1a1a1a;">New website contact</h2>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 13px; width: 80px;">From</td>
          <td style="padding: 8px 0; font-weight: 500;">${escape(name)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Email</td>
          <td style="padding: 8px 0;"><a href="mailto:${escape(email)}">${escape(email)}</a></td>
        </tr>
        ${phone ? `<tr>
          <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Phone</td>
          <td style="padding: 8px 0;"><a href="tel:${escape(phone)}">${escape(phone)}</a></td>
        </tr>` : ""}
      </table>
      <div style="padding: 16px; background: #f9fafb; border-radius: 6px;">
        <p style="font-size: 12px; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Message</p>
        <p style="font-size: 15px; line-height: 1.6; white-space: pre-wrap; margin: 0;">${escape(message)}</p>
      </div>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
        Reply to this email to respond directly to ${escape(name)}.
      </p>
      <p style="font-size: 11px; color: #9ca3af; margin-top: 8px;">
        Submitted via ${escape(siteName)} — powered by TracPost
      </p>
    </div>
  `;
}

function buildVisitorConfirmation({ name, siteName, message }: {
  name: string; siteName: string; message: string;
}): string {
  return `
    <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
      <h1 style="font-size: 22px; font-weight: 600; color: #1a1a1a; margin-bottom: 16px;">
        Thanks, ${escape(name)}
      </h1>
      <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin-bottom: 16px;">
        We received your message and will be in touch shortly.
      </p>
      <div style="margin: 24px 0; padding: 16px; background: #f9fafb; border-radius: 6px;">
        <p style="font-size: 12px; color: #6b7280; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em;">Your message</p>
        <p style="font-size: 14px; color: #4b5563; line-height: 1.6; white-space: pre-wrap; margin: 0;">${escape(message)}</p>
      </div>
      <p style="font-size: 13px; color: #9ca3af;">
        If you need to reach us sooner, reply to this email directly.
      </p>
      <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
        — ${escape(siteName)}
      </p>
    </div>
  `;
}
