import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ConnectInstagramButton } from "./connect-instagram";
import { ConnectGoogleButton } from "./connect-google";
import { LinkAccountForm } from "./link-account";
import { DisconnectButton } from "./disconnect-button";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const subscriberId = session.subscriberId;

  // All social accounts owned by this subscriber
  const accounts = await sql`
    SELECT sa.id, sa.platform, sa.account_name, sa.status, sa.token_expires_at,
           sa.created_at,
           (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'published') AS published,
           (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'scheduled') AS scheduled
    FROM social_accounts sa
    WHERE sa.subscriber_id = ${subscriberId}
    ORDER BY sa.created_at DESC
  `;

  // Sites for linking
  const sites = await sql`
    SELECT id, name, url FROM sites
    WHERE subscriber_id = ${subscriberId}
    ORDER BY created_at ASC
  `;

  // Current links
  const links = await sql`
    SELECT ssl.social_account_id, ssl.site_id, s.name AS site_name
    FROM site_social_links ssl
    JOIN sites s ON ssl.site_id = s.id
    JOIN social_accounts sa ON ssl.social_account_id = sa.id
    WHERE sa.subscriber_id = ${subscriberId}
  `;

  // Group links by account
  const linksByAccount = new Map<string, Array<{ siteId: string; siteName: string }>>();
  for (const link of links) {
    const existing = linksByAccount.get(link.social_account_id) || [];
    existing.push({ siteId: link.site_id, siteName: link.site_name });
    linksByAccount.set(link.social_account_id, existing);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-lg font-semibold">Social Accounts</h1>
          <p className="text-sm text-muted">Connect and link accounts to your sites</p>
        </div>
        <div className="flex gap-2">
          <ConnectInstagramButton />
          {session.activeSiteId && (
            <ConnectGoogleButton siteId={session.activeSiteId} />
          )}
        </div>
      </div>

      {accounts.length > 0 ? (
        <div className="space-y-4">
          {accounts.map((acc) => {
            const expires = acc.token_expires_at ? new Date(acc.token_expires_at) : null;
            const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86400000) : null;
            const urgent = daysLeft !== null && daysLeft < 7;
            const accountLinks = linksByAccount.get(acc.id) || [];

            return (
              <div key={acc.id} className="rounded-lg border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium">{acc.account_name}</h3>
                    <p className="mt-0.5 text-xs text-muted">{acc.platform}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${acc.status === "active" ? "text-success" : "text-danger"}`}>
                      {acc.status}
                    </span>
                    <DisconnectButton accountId={acc.id} accountName={acc.account_name} />
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-4 border-t border-border pt-4 text-center">
                  <div>
                    <p className="text-lg font-semibold">{acc.published}</p>
                    <p className="text-[10px] text-muted">Published</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{acc.scheduled}</p>
                    <p className="text-[10px] text-muted">Scheduled</p>
                  </div>
                  <div>
                    <p className={`text-lg font-semibold ${urgent ? "text-danger" : ""}`}>
                      {daysLeft !== null ? `${daysLeft}d` : "—"}
                    </p>
                    <p className="text-[10px] text-muted">Token Expires</p>
                  </div>
                </div>

                {/* Linked sites */}
                <div className="mt-4 border-t border-border pt-4">
                  <p className="mb-2 text-xs text-muted">Linked Sites</p>
                  {accountLinks.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {accountLinks.map((link) => (
                        <span key={link.siteId} className="rounded bg-accent/10 px-2 py-1 text-xs text-accent">
                          {link.siteName}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-warning">Not linked to any site</p>
                  )}
                  {sites.length > 0 && (
                    <LinkAccountForm
                      accountId={acc.id}
                      sites={sites.map((s) => ({ id: s.id, name: s.name }))}
                      linkedSiteIds={accountLinks.map((l) => l.siteId)}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-8 py-16 text-center">
          <span className="mb-3 text-3xl">◉</span>
          <h3 className="mb-1 text-sm font-medium">No accounts connected</h3>
          <p className="max-w-xs text-xs text-muted">
            Connect your Instagram account to start publishing content automatically.
          </p>
        </div>
      )}
    </div>
  );
}
