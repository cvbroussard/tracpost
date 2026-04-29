/**
 * Email service via Resend.
 *
 * Env: RESEND_API_KEY
 */
import { Resend } from "resend";
import { emailLayout, ctaButton } from "./email-layout";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = "TracPost <hello@tracpost.com>";
const REPLY_TO_DEFAULT = "support@tracpost.com";

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
      replyTo: replyTo || REPLY_TO_DEFAULT,
    });
    return true;
  } catch (err) {
    console.error("Email send failed:", err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Send welcome email with magic link.
 *
 * Mercury-style layout: centered logo, single CTA, reply invitation,
 * italic team sign-off, hairline divider, compliance footer with
 * social icons.
 */
export async function sendWelcomeEmail(email: string, magicUrl: string, isNew: boolean): Promise<boolean> {
  const heading = isNew ? "Welcome to TracPost" : "Welcome back";
  const intro = isNew
    ? "Your account is ready. Click below to open your dashboard while our team finishes provisioning your studio in the background."
    : "Click below to sign in to your dashboard.";

  const body = `
    <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
      ${heading}
    </h1>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
      ${intro}
    </p>
    ${ctaButton({ href: magicUrl, label: "Open your dashboard" })}
    <p style="font-size: 12px; color: #9ca3af; line-height: 1.5; margin: 16px 0 0; text-align: center;">
      This link expires in 7 days. If you didn&apos;t expect this email, you can safely ignore it.
    </p>
  `;

  return sendEmail({
    to: email,
    subject: isNew ? "Welcome to TracPost — open your dashboard" : "Welcome back to TracPost",
    html: emailLayout({
      preheader: isNew
        ? "Your TracPost dashboard is ready. Click to open."
        : "Click to sign in to your TracPost dashboard.",
      body,
    }),
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

  const body = `
    <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
      Your blog and portfolio are ready
    </h1>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 18px;">
      Hi ${tenantName}, add these DNS records with your domain provider to connect ${siteName}:
    </p>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
      <thead>
        <tr style="background: #f9fafb;">
          <th style="padding: 9px 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Type</th>
          <th style="padding: 9px 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Name</th>
          <th style="padding: 9px 12px; text-align: left; font-size: 12px; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Value</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="font-size: 13px; color: #6b7280; line-height: 1.6; margin: 0 0 18px;">
      <p style="margin: 0 0 8px;">If you use Cloudflare, set CNAME records to <strong>DNS only</strong> (grey cloud, not proxied).</p>
      ${hasTxt ? '<p style="margin: 0 0 8px;">TXT records are for ownership verification and can be deleted once your domains are active.</p>' : ""}
      <p style="margin: 0;">Not sure how to do this? Forward this email to whoever manages your domain — they&apos;ll know what to do.</p>
    </div>
    <div style="padding: 14px 16px; background: #f9fafb; border-radius: 8px;">
      <p style="font-size: 14px; font-weight: 600; color: #1a1a1a; margin: 0 0 4px;">Once DNS is live, your site lives at:</p>
      <a href="https://${domain}" style="font-size: 14px; color: #1d4ed8;">https://${domain}</a>
    </div>
  `;

  return sendEmail({
    to,
    subject: `${siteName} — Connect your blog and portfolio domains`,
    html: emailLayout({
      preheader: `DNS records to connect ${siteName} to ${domain}.`,
      body,
    }),
  });
}

/**
 * Send OTP verification code.
 */
export async function sendOtpEmail(email: string, code: string, action: string): Promise<boolean> {
  const body = `
    <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 8px;">
      Your verification code
    </h1>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 18px;">
      Use this code to ${action}:
    </p>
    <div style="text-align: center; margin: 18px 0; padding: 18px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px;">
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 10px; font-family: ui-monospace, 'SF Mono', monospace; color: #1a1a1a;">
        ${code}
      </div>
    </div>
    <p style="font-size: 12px; color: #9ca3af; line-height: 1.5; margin: 14px 0 0; text-align: center;">
      This code expires in 10 minutes. If you didn&apos;t request it, you can safely ignore this email.
    </p>
  `;

  return sendEmail({
    to: email,
    subject: `${code} — TracPost verification code`,
    html: emailLayout({
      preheader: `Your TracPost verification code is ${code}.`,
      body,
    }),
  });
}
