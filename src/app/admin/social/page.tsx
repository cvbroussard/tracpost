import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SocialAccountsPage() {
  const accounts = await sql`
    SELECT sa.id, sa.platform, sa.account_name, sa.account_id, sa.status,
           sa.token_expires_at, sa.created_at,
           sub.name AS subscriber_name,
           (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'published') AS published_count,
           (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'scheduled') AS scheduled_count,
           (
             SELECT array_agg(s.name)
             FROM site_social_links ssl
             JOIN sites s ON ssl.site_id = s.id
             WHERE ssl.social_account_id = sa.id
           ) AS linked_sites
    FROM social_accounts sa
    JOIN subscribers sub ON sa.subscriber_id = sub.id
    ORDER BY sa.created_at DESC
  `;

  return (
    <div className="mx-auto max-w-5xl">
      <h1>Social Accounts</h1>
      <p className="mt-2 mb-8 text-muted">All connected social accounts across subscribers</p>

      <div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-sm text-muted">
              <th className="pb-3 font-medium">Account</th>
              <th className="pb-3 font-medium">Platform</th>
              <th className="pb-3 font-medium">Subscriber</th>
              <th className="pb-3 font-medium">Linked Sites</th>
              <th className="py-3 pr-4 font-medium text-center">Published</th>
              <th className="py-3 pr-4 font-medium text-center">Scheduled</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Token Expires</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc) => {
              const expires = acc.token_expires_at ? new Date(acc.token_expires_at) : null;
              const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86400000) : null;
              const urgent = daysLeft !== null && daysLeft < 7;
              const linkedSites = (acc.linked_sites as string[] | null) || [];
              return (
                <tr key={acc.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="pb-3 font-medium">{acc.account_name}</td>
                  <td className="py-3 pr-4 text-xs">{acc.platform}</td>
                  <td className="py-3 pr-4 text-xs text-muted">{acc.subscriber_name}</td>
                  <td className="py-3 pr-4">
                    {linkedSites.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {linkedSites.map((name, i) => (
                          <span key={i} className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                            {name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-warning">Unlinked</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-center">{acc.published_count}</td>
                  <td className="py-3 pr-4 text-center">{acc.scheduled_count}</td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs ${acc.status === "active" ? "text-success" : "text-danger"}`}>
                      {acc.status}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-xs ${urgent ? "text-danger font-medium" : "text-muted"}`}>
                      {daysLeft !== null ? `${daysLeft}d` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {accounts.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-sm text-muted">
                  No social accounts connected
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
