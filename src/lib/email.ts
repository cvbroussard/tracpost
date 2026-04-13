/**
 * Email service via Resend.
 *
 * Env: RESEND_API_KEY
 */
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = "TracPost <noreply@tracpost.com>";

export async function sendEmail({
  to,
  subject,
  html,
  replyTo,
  from,
}: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  from?: string;
}): Promise<boolean> {
  if (!resend) {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject} | Reply-To: ${replyTo || "(none)"}`);
    console.log(`[EMAIL] Body: ${html.slice(0, 200)}...`);
    return true;
  }

  try {
    await resend.emails.send({
      from: from || FROM,
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
    return true;
  } catch (err) {
    console.error("Email send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Send welcome email with magic link.
 */
export async function sendWelcomeEmail(email: string, magicUrl: string, isNew: boolean): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: isNew ? "Welcome to TracPost — Open Your Dashboard" : "Welcome back to TracPost",
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">
          ${isNew ? "Welcome to TracPost" : "Welcome back"}
        </h1>
        <p style="font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 24px;">
          ${isNew
            ? "Your content engine is ready to set up. Click below to open your dashboard and get started."
            : "Click below to sign in to your dashboard."}
        </p>
        <div style="margin-bottom: 16px;">
          <a href="${magicUrl}" style="display: inline-block; background: #3b82f6; color: #fff; padding: 12px 24px; font-size: 15px; font-weight: 500; text-decoration: none; border-radius: 2px;">
            Open Your Dashboard
          </a>
        </div>
        <div style="margin-bottom: 32px;">
          <a href="${magicUrl.replace(/^https?:\/\/[^/]+/, "tracpost-studio:/")}" style="display: inline-block; border: 1px solid #e5e7eb; color: #4b5563; padding: 10px 24px; font-size: 14px; text-decoration: none; border-radius: 2px;">
            Open in TracPost Studio App
          </a>
        </div>
        <p style="font-size: 13px; color: #9ca3af;">
          This link expires in 7 days. If you didn't request this, you can ignore this email.
        </p>
      </div>
    `,
  });
}

/**
 * Send DNS setup instructions to tenant.
 */
export async function sendDnsInstructionsEmail({
  to,
  tenantName,
  siteName,
  domain,
  dnsRecords,
}: {
  to: string;
  tenantName: string;
  siteName: string;
  domain: string;
  dnsRecords: Array<{ type: string; name: string; value: string; purpose: string }>;
}): Promise<boolean> {
  const rows = dnsRecords.map((r) =>
    `<tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 13px;">${r.type}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 13px;">${r.name}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-family: monospace; font-size: 13px; word-break: break-all;">${r.value}</td>
    </tr>`
  ).join("");

  const hasTxt = dnsRecords.some((r) => r.type === "TXT");

  return sendEmail({
    to,
    subject: `${siteName} — Connect your blog and portfolio domains`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 22px; font-weight: 600; margin-bottom: 8px; color: #1a1a1a;">
          Your blog and portfolio are ready
        </h1>
        <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin-bottom: 24px;">
          Hi ${tenantName}, to connect your blog and portfolio to your domain,
          add these DNS records with your domain provider:
        </p>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; border: 1px solid #e5e7eb; border-radius: 6px;">
          <thead>
            <tr style="background: #f9fafb;">
              <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Type</th>
              <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Name</th>
              <th style="padding: 8px 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Value</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="font-size: 13px; color: #6b7280; line-height: 1.6; margin-bottom: 24px;">
          <p style="margin: 0 0 8px;">If you use Cloudflare, set CNAME records to <strong>DNS only</strong> (grey cloud, not proxied).</p>
          ${hasTxt ? '<p style="margin: 0 0 8px;">TXT records are for ownership verification and can be deleted once your domains are active.</p>' : ""}
          <p style="margin: 0;">Not sure how to do this? Forward this email to whoever manages your domain — they&apos;ll know what to do.</p>
        </div>
        <div style="margin-bottom: 24px; padding: 16px; background: #f9fafb; border-radius: 6px;">
          <p style="font-size: 14px; font-weight: 600; color: #1a1a1a; margin: 0 0 8px;">Add these links to your website navigation:</p>
          <p style="font-size: 14px; color: #4b5563; margin: 0 0 4px;">
            Blog &rarr; <a href="https://blog.${domain}" style="color: #3b82f6;">https://blog.${domain}</a>
          </p>
          <p style="font-size: 14px; color: #4b5563; margin: 0;">
            Projects &rarr; <a href="https://projects.${domain}" style="color: #3b82f6;">https://projects.${domain}</a>
          </p>
        </div>
        <p style="font-size: 12px; color: #9ca3af;">
          — The ${siteName} content team, powered by TracPost
        </p>
      </div>
    `,
  });
}

/**
 * Send OTP verification code.
 */
export async function sendOtpEmail(email: string, code: string, action: string): Promise<boolean> {
  return sendEmail({
    to: email,
    subject: `${code} — TracPost verification code`,
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">
          Verification code
        </h1>
        <p style="font-size: 16px; color: #4b5563; line-height: 1.6; margin-bottom: 16px;">
          Use this code to ${action}:
        </p>
        <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; padding: 16px 0; font-family: monospace;">
          ${code}
        </div>
        <p style="font-size: 13px; color: #9ca3af; margin-top: 24px;">
          This code expires in 10 minutes. If you didn't request this, you can ignore this email.
        </p>
      </div>
    `,
  });
}
