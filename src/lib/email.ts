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
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<boolean> {
  if (!resend) {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
    console.log(`[EMAIL] Body: ${html.slice(0, 200)}...`);
    return true;
  }

  try {
    await resend.emails.send({ from: FROM, to, subject, html });
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
