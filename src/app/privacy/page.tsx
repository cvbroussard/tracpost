export const metadata = {
  title: "Privacy Policy — Tracpost",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-2 text-lg font-semibold">Privacy Policy</h1>
      <p className="mb-8 text-xs text-muted">Last updated: March 15, 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/80">
        <section>
          <h2 className="mb-2 font-medium text-foreground">1. What We Collect</h2>
          <p>
            When you connect a social media account through Tracpost, we collect and store:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Your email address and account credentials (password stored as a bcrypt hash)</li>
            <li>Instagram Business Account profile information (username, account ID)</li>
            <li>Facebook Page information (Page ID, Page name) linked to your Instagram account</li>
            <li>OAuth access tokens issued by Meta for publishing and account management</li>
            <li>Content you create or schedule through the platform (posts, captions, media references)</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">2. How We Use Your Data</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Authenticate your identity and manage your dashboard session</li>
            <li>Publish content to your connected Instagram Business Account on your behalf</li>
            <li>Display your account status, linked sites, and scheduled content</li>
            <li>Monitor token expiration and prompt renewal</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">3. Data Storage and Security</h2>
          <p>
            Your data is stored in a PostgreSQL database hosted by Neon with encryption at rest
            and TLS in transit. Access tokens are stored alongside your account record and used
            exclusively for API calls to Meta on your behalf. Passwords are hashed using bcrypt
            and are never stored in plaintext.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">4. Third-Party Services</h2>
          <p>
            Tracpost integrates with Meta (Facebook/Instagram) APIs to provide social media
            publishing. When you connect your account, Meta&apos;s own privacy policy and terms
            also apply to the data shared through their platform. We do not sell, rent, or share
            your data with any other third parties.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">5. Data Retention</h2>
          <p>
            We retain your data for as long as your account is active. When you disconnect a
            social account, we revoke the access token with Meta and delete the account record
            and all associated site links from our database. You may request full account
            deletion at any time.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">6. Your Rights</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Disconnect your social accounts at any time from the dashboard</li>
            <li>Request deletion of all your data by contacting us</li>
            <li>Revoke Tracpost&apos;s access via Facebook Settings &rarr; Apps and Websites</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">7. Data Deletion</h2>
          <p>
            To request deletion of your data, visit our{" "}
            <a href="/data-deletion" className="text-accent hover:underline">
              data deletion page
            </a>{" "}
            or contact us at the email below. We will process deletion requests within 30 days.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">8. Contact</h2>
          <p>
            For privacy inquiries, contact us at{" "}
            <a href="mailto:privacy@tracpost.com" className="text-accent hover:underline">
              privacy@tracpost.com
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}
