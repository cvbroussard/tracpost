import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [recentRuns, failures, tokenHealth] = await Promise.all([
    sql`
      SELECT sph.action, sph.old_status, sph.new_status, sph.notes, sph.created_at,
             sp.caption, sa.account_name, sa.platform
      FROM social_post_history sph
      JOIN social_posts sp ON sph.post_id = sp.id
      JOIN social_accounts sa ON sp.account_id = sa.id
      ORDER BY sph.created_at DESC
      LIMIT 20
    `,
    sql`
      SELECT sp.id, sp.caption, sp.error_message, sp.updated_at,
             sa.account_name, sa.platform, sub.name AS subscriber_name
      FROM social_posts sp
      JOIN social_accounts sa ON sp.account_id = sa.id
      JOIN subscribers sub ON sa.subscriber_id = sub.id
      WHERE sp.status = 'failed'
      ORDER BY sp.updated_at DESC
      LIMIT 10
    `,
    sql`
      SELECT sa.account_name, sa.platform, sa.status, sa.token_expires_at,
             sub.name AS subscriber_name,
             (SELECT array_agg(s.name) FROM site_social_links ssl JOIN sites s ON ssl.site_id = s.id WHERE ssl.social_account_id = sa.id) AS linked_sites
      FROM social_accounts sa
      JOIN subscribers sub ON sa.subscriber_id = sub.id
      WHERE sa.token_expires_at IS NOT NULL
      ORDER BY sa.token_expires_at ASC
    `,
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1>Pipeline</h1>
      <p className="mt-2 mb-8 text-muted">Publishing pipeline health and history</p>

      {/* Token Health */}
      <section className="mb-8">
        <h2 className="mb-4">Token Health</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-sm text-muted">
              <th className="pb-3 font-medium">Account</th>
              <th className="pb-3 font-medium">Platform</th>
              <th className="pb-3 font-medium">Subscriber</th>
              <th className="pb-3 font-medium">Linked Sites</th>
              <th className="pb-3 font-medium">Status</th>
              <th className="pb-3 font-medium">Expires</th>
            </tr>
          </thead>
          <tbody>
            {tokenHealth.map((t) => {
              const expires = t.token_expires_at ? new Date(t.token_expires_at) : null;
              const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86400000) : null;
              const urgent = daysLeft !== null && daysLeft < 7;
              return (
                <tr key={`${t.account_name}-${t.platform}`} className="border-b border-border last:border-0 transition-colors hover:bg-surface-hover">
                  <td className="py-3 pr-4 font-medium">{t.account_name}</td>
                  <td className="py-3 pr-4 text-sm">{t.platform}</td>
                  <td className="py-3 pr-4 text-sm text-muted">{t.subscriber_name}</td>
                  <td className="py-3 pr-4 text-sm">
                    {(t.linked_sites as string[] | null)?.join(", ") || <span className="text-warning">Unlinked</span>}
                  </td>
                  <td className="py-3 pr-4">
                    <span className={`text-sm ${t.status === "active" ? "text-success" : "text-danger"}`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="py-3">
                    <span className={`text-sm ${urgent ? "text-danger font-medium" : "text-muted"}`}>
                      {daysLeft !== null ? `${daysLeft}d` : "—"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {tokenHealth.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">No social accounts</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Failed Posts */}
      {failures.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4 text-danger">Failed Posts ({failures.length})</h2>
          <div>
            {failures.map((f) => (
              <div key={f.id} className="border-b border-border py-4 last:border-0">
                <div className="flex items-start justify-between">
                  <div>
                    <p>{f.caption || "No caption"}</p>
                    <p className="mt-1 text-sm text-muted">{f.account_name} ({f.platform}) — {f.subscriber_name}</p>
                  </div>
                  <span className="text-sm text-muted">{new Date(f.updated_at).toLocaleString()}</span>
                </div>
                <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{f.error_message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Activity Log */}
      <section>
        <h2 className="mb-4">Activity Log</h2>
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-sm text-muted">
              <th className="pb-3 font-medium">Action</th>
              <th className="pb-3 font-medium">Account</th>
              <th className="pb-3 font-medium">Status Change</th>
              <th className="pb-3 font-medium">Notes</th>
              <th className="pb-3 font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {recentRuns.map((r, i) => (
              <tr key={i} className="border-b border-border last:border-0 transition-colors hover:bg-surface-hover">
                <td className="py-3 pr-4 text-sm font-medium">{r.action}</td>
                <td className="py-3 pr-4 text-sm text-muted">{r.account_name}</td>
                <td className="py-3 pr-4 text-sm">
                  <span className="text-muted">{r.old_status}</span>
                  <span className="text-muted"> → </span>
                  <span className={r.new_status === "published" ? "text-success" : r.new_status === "failed" ? "text-danger" : ""}>
                    {r.new_status}
                  </span>
                </td>
                <td className="max-w-xs truncate py-3 pr-4 text-sm text-muted">{r.notes || "—"}</td>
                <td className="py-3 text-sm text-muted">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {recentRuns.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted">No pipeline activity yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
