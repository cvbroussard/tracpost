export const metadata = {
  title: "Data Deletion — Tracpost",
};

export default function DataDeletionPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="mb-2 text-lg font-semibold">Data Deletion</h1>
      <p className="mb-8 text-xs text-muted">How to delete your data from Tracpost</p>

      <div className="space-y-6 text-sm leading-relaxed text-foreground/80">
        <section>
          <h2 className="mb-2 font-medium text-foreground">Disconnect Your Account</h2>
          <p>
            You can disconnect your Instagram account at any time from your{" "}
            <a href="/dashboard/integrations" className="text-accent hover:underline">
              dashboard
            </a>
            . When you disconnect, Tracpost will:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Revoke your access token with Meta immediately</li>
            <li>Delete your social account record from our database</li>
            <li>Remove all site links associated with that account</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">Full Account Deletion</h2>
          <p>
            To request complete deletion of all your data (subscriber record, sites, social
            accounts, scheduled posts, and usage history), email{" "}
            <a href="mailto:privacy@tracpost.com" className="text-accent hover:underline">
              privacy@tracpost.com
            </a>{" "}
            with the subject line &ldquo;Data Deletion Request&rdquo; and include the email
            address associated with your account. We will process your request within 30 days.
          </p>
        </section>

        <section>
          <h2 className="mb-2 font-medium text-foreground">Revoke via Facebook</h2>
          <p>
            You can also revoke Tracpost&apos;s access directly from Facebook:
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Go to Facebook Settings &rarr; Security and Login &rarr; Apps and Websites</li>
            <li>Find Tracpost in the list of active apps</li>
            <li>Click Remove to revoke access</li>
          </ol>
          <p className="mt-2">
            This revokes our token immediately. Any data already stored in our system will
            be deleted when you disconnect from your dashboard or request full deletion.
          </p>
        </section>
      </div>
    </div>
  );
}
