/**
 * /onboarding — bare entry point.
 *
 * If the browser has a `tp_onboarding_token` cookie from a prior visit,
 * resolve it server-side and redirect to /onboarding/[token]. Otherwise
 * surface a "find your link" prompt that uses the existing resend flow.
 *
 * Lets subscribers bookmark `/onboarding` and pick up where they left
 * off without keeping the long token URL around.
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getByToken, isExpired } from "@/lib/onboarding/queries";

export const dynamic = "force-dynamic";

const ONBOARDING_TOKEN_COOKIE = "tp_onboarding_token";

export default async function OnboardingEntry() {
  const cookieStore = await cookies();
  const cookied = cookieStore.get(ONBOARDING_TOKEN_COOKIE)?.value;

  if (cookied) {
    const submission = await getByToken(cookied);
    if (submission && !submission.completed_at && !isExpired(submission)) {
      redirect(`/onboarding/${cookied}`);
    }
    // Stale cookie — clear it before showing prompt
    cookieStore.set({
      name: ONBOARDING_TOKEN_COOKIE,
      value: "",
      maxAge: 0,
      path: "/",
    });
  }

  return (
    <div className="op-shell">
      <div className="op-card">
        <h1 className="op-h1">Find your onboarding link</h1>
        <p className="op-body">
          We email a unique link when you sign up. If you can&apos;t find it, request a fresh one
          and we&apos;ll send it to the email tied to your subscription.
        </p>
        <Link href="/onboarding/resend" className="op-btn-primary">
          Send me a fresh link
        </Link>
        <p className="op-body op-body-muted" style={{ marginTop: 24 }}>
          Already finished onboarding?{" "}
          <Link href="/login" style={{ color: "#1a1a1a", textDecoration: "underline" }}>
            Sign in to your dashboard
          </Link>
          .
        </p>
      </div>
      <style dangerouslySetInnerHTML={{ __html: shellStyles }} />
    </div>
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
    max-width: 460px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 40px 36px;
    text-align: center;
  }
  .op-h1 {
    font-size: 22px;
    font-weight: 700;
    color: #1a1a1a;
    margin: 0 0 12px;
  }
  .op-body {
    font-size: 14px;
    color: #4b5563;
    line-height: 1.6;
    margin: 0 0 20px;
  }
  .op-body-muted {
    font-size: 13px;
    color: #6b7280;
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
  }
`;
