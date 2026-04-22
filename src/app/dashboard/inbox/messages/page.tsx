import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <EmptyState
        icon="✉"
        title="Messages"
        description="Add a site to start receiving contact messages."
      />
    );
  }

  const siteId = session.activeSiteId;

  const submissions = await sql`
    SELECT id, name, email, phone, message, created_at,
           email_sent, email_error, is_spam, spam_reason
    FROM contact_submissions
    WHERE site_id = ${siteId}
    ORDER BY created_at DESC
    LIMIT 100
  `;

  const validSubmissions = submissions.filter((s) => !s.is_spam);
  const spamCount = submissions.length - validSubmissions.length;

  if (validSubmissions.length === 0) {
    return (
      <div className="p-4 space-y-6">
        <h1 className="mb-1 text-lg font-semibold">Messages</h1>
        <p className="mb-8 text-sm text-muted">
          Contact form submissions from your website.
        </p>
        <EmptyState
          icon="✉"
          title="No messages yet"
          description="When visitors submit your website contact form, their messages appear here."
        />
        {spamCount > 0 && (
          <p className="mt-6 text-center text-xs text-muted">
            {spamCount} spam submission{spamCount !== 1 ? "s" : ""} filtered
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <h1 className="mb-1 text-lg font-semibold">Messages</h1>
      <p className="mb-8 text-sm text-muted">
        Contact form submissions from your website. Reply directly to the visitor via email — replies from your inbox go straight to them.
      </p>

      <div className="space-y-3">
        {validSubmissions.map((s) => {
          const name = s.name as string;
          const email = s.email as string;
          const phone = s.phone as string | null;
          const message = s.message as string;
          const createdAt = new Date(s.created_at as string);
          const emailSent = s.email_sent as boolean;
          const emailError = s.email_error as string | null;

          return (
            <div
              key={String(s.id)}
              className="rounded border border-border bg-surface p-4"
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{name}</span>
                    {!emailSent && (
                      <span className="rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-medium text-warning">
                        Delivery failed
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                    <a href={`mailto:${email}`} className="hover:text-accent">
                      {email}
                    </a>
                    {phone && (
                      <a href={`tel:${phone}`} className="hover:text-accent">
                        {phone}
                      </a>
                    )}
                  </div>
                </div>
                <time className="text-xs text-muted whitespace-nowrap">
                  {createdAt.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: createdAt.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
                  })}
                  {" · "}
                  {createdAt.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </time>
              </div>
              <div className="rounded bg-background p-3 text-sm leading-relaxed whitespace-pre-wrap">
                {message}
              </div>
              {emailError && (
                <p className="mt-2 text-xs text-warning">
                  Email to you failed: {emailError}. Reply directly from this page.
                </p>
              )}
              <div className="mt-3 flex items-center gap-3">
                <a
                  href={`mailto:${email}?subject=Re: your message`}
                  className="text-xs text-accent hover:underline"
                >
                  Reply via email
                </a>
                {phone && (
                  <a
                    href={`tel:${phone}`}
                    className="text-xs text-accent hover:underline"
                  >
                    Call
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {spamCount > 0 && (
        <p className="mt-6 text-center text-xs text-muted">
          {spamCount} spam submission{spamCount !== 1 ? "s" : ""} filtered
        </p>
      )}
    </div>
  );
}
