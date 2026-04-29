import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SMS Consent — TracPost (review reference)",
  description:
    "SMS consent capture flows, opt-out mechanisms, sample messages, and use case statement for SMS provider and registry reviewers.",
  robots: { index: false, follow: false },
};

const SMS_CONSENT_TEXT =
  "I agree to receive transactional SMS messages from TracPost about my account, urgent customer engagement (e.g., negative reviews), and security codes. Msg & data rates may apply. Reply STOP to opt out at any time, HELP for help.";

const STOP_REPLY =
  "TracPost: You're unsubscribed and will receive no further messages. Reply START to re-subscribe.";

const HELP_REPLY =
  "TracPost: For help reply HELP, to opt out reply STOP. Support: support@tracpost.com. Msg & data rates may apply.";

const SAMPLE_MESSAGES = [
  {
    use_case: "Negative review alert",
    when: "A 1-2 star review lands on Google Business Profile and the owner has not responded within their configured response window.",
    body: "TracPost: New 1-star review on Google for {Business Name}. Tap to draft a reply: tracpost.com/r/abc123. Reply STOP to opt out.",
  },
  {
    use_case: "Account-critical (billing failure)",
    when: "Stripe reports a payment failure and the account is in the recovery retry window.",
    body: "TracPost: Payment failed for your subscription. Update your card before {date} to keep your account active: tracpost.com/billing. Reply STOP to opt out.",
  },
  {
    use_case: "Magic-link / OTP",
    when: "Subscriber requests a sign-in code, or owner triggers a destructive action requiring step-up authentication.",
    body: "Your TracPost sign-in code is 482917. Code expires in 10 minutes. Reply STOP to opt out, HELP for help.",
  },
  {
    use_case: "Operator-flagged urgent nudge",
    when: "An operator on the TracPost team flags an onboarding stall or other time-sensitive issue requiring the owner's attention.",
    body: "TracPost: We noticed your TikTok connection step is stuck. Quick fix in the app: Settings → Account → Switch to Business. Need help? Reply or email support@tracpost.com. Reply STOP to opt out.",
  },
];

export default function SmsConsentExamplePage() {
  return (
    <main
      style={{
        background: "#fafafa",
        minHeight: "100vh",
        padding: "60px 20px 80px",
        fontFamily:
          'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
        color: "#1a1a1a",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <header style={{ marginBottom: 32 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 0.14,
              color: "#9ca3af",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Review Reference
          </p>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "#1a1a1a",
              margin: "6px 0 14px",
              letterSpacing: -0.01,
            }}
          >
            TracPost SMS consent flows
          </h1>
          <p style={{ fontSize: 15, color: "#4b5563", lineHeight: 1.6, margin: 0 }}>
            This page exists for SMS provider and registry reviewers. It documents every point at
            which TracPost obtains SMS consent, the verbatim language shown to users, the opt-out
            mechanisms, and sample messages users may receive. The content here mirrors the
            campaign application so reviewers can verify it without back-and-forth.
          </p>
        </header>

        <Section title="Use case statement">
          <p>
            TracPost sends SMS exclusively for transactional, time-sensitive notifications. We do
            not send marketing or promotional SMS. The use cases are:
          </p>
          <ol style={{ paddingLeft: 22, lineHeight: 1.7, margin: "8px 0 0" }}>
            <li>
              <strong>Negative-review alerts</strong> — when a low-rating customer review lands on
              the subscriber&apos;s public profiles requiring time-sensitive response
            </li>
            <li>
              <strong>Account-critical</strong> — payment failure, scheduled suspension, security
              alerts
            </li>
            <li>
              <strong>Magic-link / OTP codes</strong> — sign-in and step-up authentication
            </li>
            <li>
              <strong>Operator-flagged urgent help nudges</strong> — when our team identifies a
              time-sensitive issue with the subscriber&apos;s setup
            </li>
          </ol>
          <p>
            Recipients explicitly opt in during onboarding or in their account settings. The opt-in
            is unchecked by default; the user must affirmatively select an option that includes
            SMS. The verbatim consent text appears immediately below.
          </p>
        </Section>

        <Section title="Capture point #1 — Onboarding wizard, Step 6 (Owner contact)">
          <p>
            The first opt-in opportunity occurs during the onboarding wizard. Users select a
            notification preference; SMS is one of three options and is <strong>not the default</strong>.
            When the SMS-inclusive option is selected, the verbatim consent text below is rendered
            immediately so the user sees what they&apos;re agreeing to before continuing.
          </p>
          <ConsentCard text={SMS_CONSENT_TEXT} />
          <p style={{ fontSize: 13, color: "#6b7280", marginTop: 12 }}>
            <strong>Audit fields recorded on opt-in:</strong> subscription_id, user_id, channel,
            consent_type, action, source (=&quot;onboarding_step_6&quot;), the verbatim consent_text
            above, phone_number, ip_address, user_agent, created_at.
          </p>
        </Section>

        <Section title="Capture point #2 — Account settings page (post-onboarding)">
          <p>
            Subscribers can change their notification preferences at any time from their dashboard
            settings page. Selecting the SMS-inclusive option there shows the same verbatim consent
            text, and a new consent row is appended (action=&quot;opt_in&quot;, source=
            &quot;settings_page&quot;).
          </p>
          <ConsentCard text={SMS_CONSENT_TEXT} />
        </Section>

        <Section title="Opt-out mechanisms">
          <p>Subscribers can opt out of SMS through any of three paths:</p>
          <ol style={{ paddingLeft: 22, lineHeight: 1.7, margin: "8px 0 0" }}>
            <li>
              <strong>Reply STOP</strong> (or UNSUBSCRIBE / CANCEL / END / QUIT) to any TracPost
              SMS. Provider webhooks route the inbound message to our handler, which records an
              opt_out row in <code>comms_consent</code> and triggers the carrier-required reply.
            </li>
            <li>
              <strong>Toggle SMS off</strong> in the dashboard settings page. Records an opt_out
              row with source=&quot;settings_page&quot;.
            </li>
            <li>
              <strong>Email support</strong> at support@tracpost.com. An operator records an
              opt_out row with source=&quot;operator&quot;.
            </li>
          </ol>
          <p>
            Once a phone number is opted out, no further SMS is sent until the subscriber
            explicitly opts back in. Re-opt-in is recorded as a new consent row; the audit log
            preserves the full history of every state change.
          </p>
        </Section>

        <Section title="Carrier-required STOP and HELP replies">
          <p>
            Per CTIA guidelines and carrier requirements, the following replies are sent
            automatically when the keywords are detected:
          </p>
          <h4 style={subheaderStyle}>STOP / UNSUBSCRIBE / CANCEL / END / QUIT</h4>
          <ConsentCard text={STOP_REPLY} />
          <h4 style={subheaderStyle}>HELP / INFO</h4>
          <ConsentCard text={HELP_REPLY} />
          <h4 style={subheaderStyle}>START / UNSTOP / YES (re-subscribe)</h4>
          <ConsentCard text="TracPost: You're re-subscribed. Reply STOP to opt out at any time. Msg & data rates may apply." />
        </Section>

        <Section title="Sample messages">
          <p>
            Representative messages a subscriber may receive. Every message ends with a STOP
            reminder; the first message after opt-in includes the full carrier disclosure.
          </p>
          {SAMPLE_MESSAGES.map((m) => (
            <div
              key={m.use_case}
              style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: "16px 18px",
                marginTop: 14,
              }}
            >
              <h4 style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", margin: "0 0 4px" }}>
                {m.use_case}
              </h4>
              <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.55, margin: "0 0 10px" }}>
                {m.when}
              </p>
              <div
                style={{
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "10px 12px",
                  fontFamily: 'ui-monospace, "SF Mono", monospace',
                  fontSize: 13,
                  color: "#1a1a1a",
                  lineHeight: 1.5,
                }}
              >
                {m.body}
              </div>
            </div>
          ))}
        </Section>

        <Section title="Privacy policy & terms">
          <p>
            SMS-specific provisions are documented in our privacy policy and terms of service. Both
            are publicly accessible:
          </p>
          <ul style={{ paddingLeft: 22, lineHeight: 1.8, margin: "6px 0 0" }}>
            <li>
              Privacy policy: <a href="/privacy" style={linkStyle}>tracpost.com/privacy</a>
            </li>
            <li>
              Terms of service: <a href="/terms" style={linkStyle}>tracpost.com/terms</a>
            </li>
          </ul>
        </Section>

        <footer
          style={{
            marginTop: 48,
            paddingTop: 24,
            borderTop: "1px solid #e5e7eb",
            fontSize: 12,
            color: "#9ca3af",
            textAlign: "center",
          }}
        >
          TracPost is operated by Eppux LLC · Pittsburgh, PA · support@tracpost.com
        </footer>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#9ca3af",
          textTransform: "uppercase",
          letterSpacing: 0.12,
          margin: "0 0 12px",
        }}
      >
        {title}
      </h2>
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: "20px 22px",
          fontSize: 14,
          color: "#374151",
          lineHeight: 1.65,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function ConsentCard({ text }: { text: string }) {
  return (
    <div
      style={{
        background: "#f9fafb",
        border: "1px solid #d1d5db",
        borderRadius: 10,
        padding: "14px 16px",
        margin: "10px 0",
        fontSize: 13,
        color: "#1a1a1a",
        lineHeight: 1.6,
      }}
    >
      {text}
    </div>
  );
}

const subheaderStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#6b7280",
  margin: "16px 0 4px",
  textTransform: "uppercase",
  letterSpacing: 0.04,
};

const linkStyle: React.CSSProperties = {
  color: "#1d4ed8",
  textDecoration: "underline",
};
