/**
 * Onboarding form route — token-authorized, multi-step wizard.
 *
 * Lives on the marketing site (no studio session required). The token
 * in the URL is both authorization and continuity key — form state is
 * keyed to the submission row in onboarding_submissions.
 *
 * State machine for landing here:
 *   - Token invalid → 404 page
 *   - Token expired → "request new link" page
 *   - Already submitted → status page (no form, just "we'll be in touch")
 *   - Otherwise → render the wizard at current_step
 */
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getByToken, isExpired } from "@/lib/onboarding/queries";
import { OnboardingWizard } from "./wizard";

export const dynamic = "force-dynamic";

const ONBOARDING_TOKEN_COOKIE = "tp_onboarding_token";
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

interface Props {
  params: Promise<{ token: string }>;
}

export default async function OnboardingPage({ params }: Props) {
  const { token } = await params;

  const submission = await getByToken(token);
  if (!submission) notFound();

  if (!submission.completed_at && !isExpired(submission)) {
    const cookieStore = await cookies();
    cookieStore.set({
      name: ONBOARDING_TOKEN_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: COOKIE_MAX_AGE,
      path: "/",
    });
  }

  if (isExpired(submission)) {
    return (
      <div className="op-shell">
        <div className="op-card">
          <h1 className="op-h1">This onboarding link expired</h1>
          <p className="op-body">
            For security, onboarding links expire after 30 days. Request a new one and we&apos;ll send it
            to the email tied to your subscription.
          </p>
          <a href="/onboarding/resend" className="op-btn-primary">Request a new link</a>
        </div>
        <style dangerouslySetInnerHTML={{ __html: shellStyles }} />
      </div>
    );
  }

  if (submission.completed_at) {
    return (
      <div className="op-shell">
        <div className="op-card">
          <h1 className="op-h1">You&apos;re all set</h1>
          <p className="op-body">
            Your onboarding is complete. We&apos;ve sent you a separate email with your login link to your dashboard.
            If you can&apos;t find it, check spam or contact support.
          </p>
        </div>
        <style dangerouslySetInnerHTML={{ __html: shellStyles }} />
      </div>
    );
  }

  if (submission.submitted_at) {
    const ownerEmailRaw = (submission.data as Record<string, unknown>).owner_email;
    const ownerEmail = typeof ownerEmailRaw === "string" ? ownerEmailRaw : null;
    return (
      <div className="op-shell">
        <div className="op-card">
          <h1 className="op-h1">Check your inbox</h1>
          <p className="op-body">
            Your onboarding is submitted. We sent a sign-in link
            {ownerEmail ? <> to <strong>{ownerEmail}</strong></> : <> to the email on your account</>}.
            Click it to open your dashboard while our team finishes provisioning the studio in the background.
          </p>
          <p className="op-body op-body-muted">
            No email after a few minutes? Check spam or{" "}
            <a href="/onboarding/resend" style={{ color: "#1a1a1a", textDecoration: "underline" }}>
              request a new link
            </a>
            .
          </p>
          <p className="op-body op-body-muted">
            Submitted {new Date(submission.submitted_at).toLocaleString()}
          </p>
        </div>
        <style dangerouslySetInnerHTML={{ __html: shellStyles }} />
      </div>
    );
  }

  // Active form — render the wizard
  return (
    <OnboardingWizard
      token={token}
      initialStep={submission.current_step}
      initialData={submission.data}
      platformStatus={submission.platform_status}
    />
  );
}

const shellStyles = `
  .op-shell {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: #fafafa;
  }
  .op-card {
    max-width: 560px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 48px 40px;
    text-align: center;
  }
  .op-h1 {
    font-size: 24px;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0 0 12px;
  }
  .op-body {
    font-size: 15px;
    color: #4b5563;
    line-height: 1.6;
    margin: 0 0 16px;
  }
  .op-body-muted {
    font-size: 13px;
    color: #6b7280;
    margin-top: 24px;
  }
  .op-btn-primary {
    display: inline-block;
    padding: 12px 24px;
    background: #1a1a1a;
    color: #fff;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    margin-top: 8px;
  }
`;
