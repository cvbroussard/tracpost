/**
 * Lifecycle transition emails.
 *
 * One template per state-change a subscriber should hear about. All use
 * the Mercury-style emailLayout for consistent chrome.
 *
 * Triggers:
 *   - tenantPause     → from /api/account/pause
 *   - platformPause   → from operator-side pause action (AUP / fraud / review)
 *   - suspendWarning  → from Stripe webhook payment_failed
 *   - suspendRecovery → from Stripe webhook invoice.paid after prior fail
 *   - archiveNotice   → from /api/account/cron when cancel-grace expires
 *   - revivedWelcome  → from operator action that re-onboards an archived sub
 */
import "server-only";
import { sendEmail } from "./email";
import { emailLayout, ctaButton } from "./email-layout";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://tracpost.com";

interface BaseEmail {
  to: string;
  ownerName?: string;
}

/**
 * Tenant-initiated pause confirmation. Subscriber paused themselves;
 * one-click resume in dashboard.
 */
export async function sendTenantPauseEmail({ to, ownerName }: BaseEmail) {
  const greeting = ownerName ? `Hi ${ownerName.split(" ")[0]},` : "Hi,";
  const body = `
    <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
      Your TracPost account is paused
    </h1>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 12px;">
      ${greeting} we&apos;ve paused your account at your request. While paused, no posts will go out
      and no automation will run. Your data, brand DNA, and platform connections all stay intact.
    </p>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
      Resume anytime from your dashboard:
    </p>
    ${ctaButton({ href: `${APP_URL}/dashboard/account/subscription`, label: "Resume my account" })}
  `;
  return sendEmail({
    to,
    subject: "Your TracPost account is paused",
    html: emailLayout({ preheader: "Resume anytime from your dashboard.", body }),
  });
}

/**
 * Operator-initiated pause notice. Subscriber CAN'T self-resume — they
 * have to wait for operator clearance.
 */
export async function sendPlatformPauseEmail({
  to,
  ownerName,
  reason,
}: BaseEmail & { reason: string }) {
  const greeting = ownerName ? `Hi ${ownerName.split(" ")[0]},` : "Hi,";
  const body = `
    <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
      Your TracPost account is on hold
    </h1>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 12px;">
      ${greeting} our team has paused your account while we look into a few things. Reason:
      <em>${reason}</em>.
    </p>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
      We&apos;ll reach out within 1-2 business days. If you have questions in the meantime,
      reply to this email.
    </p>
  `;
  return sendEmail({
    to,
    subject: "Your TracPost account is on hold",
    html: emailLayout({ preheader: "Our team will be in touch within 1-2 business days.", body }),
  });
}

/**
 * Payment-failure warning. Card retry will happen at provider's standard
 * cadence (Stripe: 3 retries over 7 days).
 */
export async function sendSuspendWarningEmail({
  to,
  ownerName,
  amountCents,
  retryAt,
}: BaseEmail & { amountCents: number; retryAt: string }) {
  const greeting = ownerName ? `Hi ${ownerName.split(" ")[0]},` : "Hi,";
  const amount = `$${(amountCents / 100).toFixed(2)}`;
  const retryDate = new Date(retryAt).toLocaleDateString();
  const body = `
    <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
      Payment failed — please update your card
    </h1>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 12px;">
      ${greeting} your card declined the ${amount} charge for your TracPost subscription.
      We&apos;ll retry on <strong>${retryDate}</strong>. Update your card now to avoid any
      interruption.
    </p>
    ${ctaButton({ href: `${APP_URL}/dashboard/account/subscription`, label: "Update payment method" })}
    <p style="font-size: 12px; color: #9ca3af; line-height: 1.5; margin: 16px 0 0; text-align: center;">
      Your account stays active during the retry window. If all retries fail, the account moves to
      suspended.
    </p>
  `;
  return sendEmail({
    to,
    subject: "Payment failed — please update your TracPost card",
    html: emailLayout({ preheader: `Card declined for ${amount}. Retry on ${retryDate}.`, body }),
  });
}

/**
 * Payment recovered after a previous failure.
 */
export async function sendSuspendRecoveryEmail({ to, ownerName }: BaseEmail) {
  const greeting = ownerName ? `Hi ${ownerName.split(" ")[0]},` : "Hi,";
  const body = `
    <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
      Payment recovered — you&apos;re back in business
    </h1>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
      ${greeting} your card went through. Posts and automation are running again.
      Nothing else for you to do.
    </p>
    ${ctaButton({ href: `${APP_URL}/dashboard`, label: "Open dashboard" })}
  `;
  return sendEmail({
    to,
    subject: "TracPost payment recovered — back to normal",
    html: emailLayout({ preheader: "Your card went through. Account fully active.", body }),
  });
}

/**
 * Cancel-grace expired → archived. Final notice. Data has been removed
 * except for the compliance/billing audit shell.
 */
export async function sendArchiveNoticeEmail({ to, ownerName }: BaseEmail) {
  const greeting = ownerName ? `Hi ${ownerName.split(" ")[0]},` : "Hi,";
  const body = `
    <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
      Your TracPost account is archived
    </h1>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 12px;">
      ${greeting} your cancellation grace period has ended. Your studio is offline and your
      content has been removed from our platform.
    </p>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
      We&apos;ve retained your billing records and audit trail for legal and tax compliance,
      but everything operational is gone. If you ever want to come back, reply to this email
      and we&apos;ll walk you through reactivation.
    </p>
    <p style="font-size: 12px; color: #9ca3af; line-height: 1.5; margin: 16px 0 0;">
      Thanks for your time on TracPost.
    </p>
  `;
  return sendEmail({
    to,
    subject: "Your TracPost account is archived",
    html: emailLayout({
      preheader: "Cancellation grace ended. Operational data removed; billing records retained.",
      body,
    }),
  });
}

/**
 * Operator-triggered revival of an archived account (re-onboarding).
 */
export async function sendRevivedWelcomeEmail({
  to,
  ownerName,
  onboardingUrl,
}: BaseEmail & { onboardingUrl: string }) {
  const greeting = ownerName ? `Hi ${ownerName.split(" ")[0]},` : "Hi,";
  const body = `
    <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
      Welcome back to TracPost
    </h1>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 12px;">
      ${greeting} we&apos;ve reactivated your TracPost account. Your billing history and audit
      trail were preserved, but your content starts fresh — pick up where the wizard left off
      to bring everything back online.
    </p>
    ${ctaButton({ href: onboardingUrl, label: "Continue onboarding" })}
  `;
  return sendEmail({
    to,
    subject: "Welcome back to TracPost",
    html: emailLayout({ preheader: "Pick up onboarding where you left off.", body }),
  });
}
