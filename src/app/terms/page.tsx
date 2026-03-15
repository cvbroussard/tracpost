export const metadata = {
  title: "Terms of Service — Tracpost",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-2 text-lg font-semibold">Terms of Service</h1>
      <p className="mb-8 text-xs text-muted">Last updated: March 15, 2026</p>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/80">
        <section>
          <h2 className="mb-2 font-medium text-foreground">1. Acceptance of Terms</h2>
          <p>
            By accessing or using Tracpost (&ldquo;the Service&rdquo;), you agree to be bound
            by these Terms of Service. If you do not agree, do not use the Service.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">2. Description of Service</h2>
          <p>
            Tracpost is a social media content management platform that allows subscribers to
            connect Instagram Business Accounts, schedule and publish content, and manage
            social media presence across linked sites.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">3. Account Responsibilities</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>You are responsible for maintaining the confidentiality of your login credentials and API keys</li>
            <li>You must have authorization to manage the social media accounts you connect</li>
            <li>You are responsible for all content published through your account</li>
            <li>You must comply with Meta&apos;s Platform Terms and Community Guidelines</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">4. Acceptable Use</h2>
          <p>You agree not to use the Service to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Publish spam, misleading, or prohibited content</li>
            <li>Violate any applicable laws or third-party rights</li>
            <li>Attempt to access accounts or data belonging to other subscribers</li>
            <li>Interfere with the operation of the Service</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">5. Content Ownership</h2>
          <p>
            You retain ownership of all content you create and publish through Tracpost.
            By using the Service, you grant Tracpost a limited license to store and transmit
            your content as necessary to provide the Service.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">6. Service Availability</h2>
          <p>
            Tracpost is provided &ldquo;as is&rdquo; without warranty of any kind. We do not
            guarantee uninterrupted access or that the Service will be error-free. We may
            modify or discontinue features at any time.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">7. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Tracpost shall not be liable for any
            indirect, incidental, or consequential damages arising from your use of the
            Service, including but not limited to lost revenue, failed posts, or account
            suspension by third-party platforms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">8. Termination</h2>
          <p>
            You may stop using the Service at any time by disconnecting your accounts and
            requesting data deletion. We reserve the right to suspend or terminate accounts
            that violate these terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">9. Changes to Terms</h2>
          <p>
            We may update these terms from time to time. Continued use of the Service after
            changes constitutes acceptance of the updated terms.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">10. Contact</h2>
          <p>
            For questions about these terms, contact us at{" "}
            <a href="mailto:support@tracpost.com" className="text-accent hover:underline">
              support@tracpost.com
            </a>.
          </p>
        </section>
      </div>
    </div>
  );
}
