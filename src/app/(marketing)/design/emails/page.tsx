/**
 * Email template preview — dev-only visualization of transactional emails.
 *
 * Renders each template inside an iframe so the email's own <html><body>
 * styles don't leak into the surrounding marketing layout.
 */
import { emailLayout, ctaButton } from "@/lib/email-layout";

export const dynamic = "force-dynamic";

const SAMPLE_MAGIC_URL = "https://tracpost.com/auth/magic?token=preview";
const SAMPLE_ONBOARDING_URL = "https://tracpost.com/onboarding/preview";

interface PreviewProps {
  title: string;
  subject: string;
  html: string;
}

function welcomeNew() {
  const body = `
    <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
      Welcome to TracPost
    </h1>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
      Your account is ready. Click below to open your dashboard while our team finishes provisioning your studio in the background.
    </p>
    ${ctaButton({ href: SAMPLE_MAGIC_URL, label: "Open your dashboard" })}
    <p style="font-size: 12px; color: #9ca3af; line-height: 1.5; margin: 16px 0 0; text-align: center;">
      This link expires in 7 days. If you didn&apos;t expect this email, you can safely ignore it.
    </p>
  `;
  return {
    title: "Welcome (new subscriber)",
    subject: "Welcome to TracPost — open your dashboard",
    html: emailLayout({ preheader: "Your TracPost dashboard is ready. Click to open.", body }),
  } satisfies PreviewProps;
}

function welcomeReturning() {
  const body = `
    <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
      Welcome back
    </h1>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
      Click below to sign in to your dashboard.
    </p>
    ${ctaButton({ href: SAMPLE_MAGIC_URL, label: "Open your dashboard" })}
    <p style="font-size: 12px; color: #9ca3af; line-height: 1.5; margin: 16px 0 0; text-align: center;">
      This link expires in 7 days. If you didn&apos;t expect this email, you can safely ignore it.
    </p>
  `;
  return {
    title: "Welcome back (returning subscriber)",
    subject: "Welcome back to TracPost",
    html: emailLayout({ preheader: "Click to sign in to your TracPost dashboard.", body }),
  } satisfies PreviewProps;
}

function onboardingResend() {
  const body = `
    <h1 style="font-size: 22px; font-weight: 700; color: #1a1a1a; margin: 0 0 12px;">
      Hi Carlos — here&apos;s your onboarding link
    </h1>
    <p style="font-size: 15px; color: #4b5563; line-height: 1.6; margin: 0 0 8px;">
      Pick up where you left off. The link below works for 30 days.
    </p>
    ${ctaButton({ href: SAMPLE_ONBOARDING_URL, label: "Continue onboarding" })}
    <p style="font-size: 12px; color: #9ca3af; line-height: 1.5; margin: 16px 0 0; text-align: center;">
      If you didn&apos;t request this email, you can safely ignore it.
    </p>
  `;
  return {
    title: "Onboarding resend",
    subject: "Your TracPost onboarding link",
    html: emailLayout({ preheader: "Pick up your TracPost onboarding where you left off.", body }),
  } satisfies PreviewProps;
}

export default function EmailsPreviewPage() {
  const previews = [welcomeNew(), welcomeReturning(), onboardingResend()];

  return (
    <main style={{ background: "#f0f0ee", minHeight: "100vh", padding: "40px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <header style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
            Email templates — preview
          </h1>
          <p style={{ fontSize: 13, color: "#6b7280", margin: "4px 0 0" }}>
            Mercury-style layout from <code>src/lib/email-layout.ts</code>. From:{" "}
            <code>hello@tracpost.com</code>, Reply-To: <code>support@tracpost.com</code>.
          </p>
        </header>

        {previews.map((p, i) => (
          <section key={i} style={{ marginBottom: 32 }}>
            <div
              style={{
                padding: "10px 14px",
                background: "#1a1a1a",
                color: "#fff",
                borderRadius: "10px 10px 0 0",
                fontFamily: "system-ui, sans-serif",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 500, opacity: 0.6, marginBottom: 2 }}>{p.title}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{p.subject}</div>
            </div>
            <iframe
              title={p.title}
              srcDoc={p.html}
              style={{
                width: "100%",
                minHeight: 720,
                border: "1px solid #e5e7eb",
                borderTop: "none",
                borderRadius: "0 0 10px 10px",
                background: "#fff",
              }}
            />
          </section>
        ))}
      </div>
    </main>
  );
}
