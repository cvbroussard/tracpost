import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const [recentRuns, failures, tokenHealth] = await Promise.all([
    // Recent post activity (proxy for pipeline runs)
    sql`
      SELECT sph.action, sph.old_status, sph.new_status, sph.notes, sph.created_at,
             sp.caption, sa.account_name, sa.platform
      FROM social_post_history sph
      JOIN social_posts sp ON sph.post_id = sp.id
      JOIN social_accounts sa ON sp.account_id = sa.id
      ORDER BY sph.created_at DESC
      LIMIT 20
    `,
    // Failed posts
    sql`
      SELECT sp.id, sp.caption, sp.error_message, sp.updated_at,
             sa.account_name, sa.platform, s.name AS site_name
      FROM social_posts sp
      JOIN social_accounts sa ON sp.account_id = sa.id
      JOIN sites s ON sa.site_id = s.id
      WHERE sp.status = 'failed'
      ORDER BY sp.updated_at DESC
      LIMIT 10
    `,
    // Token expiry health
    sql`
      SELECT sa.account_name, sa.platform, sa.status, sa.token_expires_at, s.name AS site_name
      FROM social_accounts sa
      JOIN sites s ON sa.site_id = s.id
      WHERE sa.token_expires_at IS NOT NULL
      ORDER BY sa.token_expires_at ASC
    `,
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-lg font-semibold">Pipeline</h1>
      <p className="mb-8 text-sm text-muted">Publishing pipeline health and history</p>

      {/* Token Health */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium">Token Health</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 font-medium">Platform</th>
                <th className="px-4 py-2 font-medium">Site</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Expires</th>
              </tr>
            </thead>
            <tbody>
              {tokenHealth.map((t) => {
                const expires = t.token_expires_at ? new Date(t.token_expires_at) : null;
                const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86400000) : null;
                const urgent = daysLeft !== null && daysLeft < 7;
                return (
                  <tr key={`${t.account_name}-${t.platform}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{t.account_name}</td>
                    <td className="px-4 py-2 text-xs">{t.platform}</td>
                    <td className="px-4 py-2 text-xs text-muted">{t.site_name}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs ${t.status === "active" ? "text-success" : "text-danger"}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-xs ${urgent ? "text-danger font-medium" : "text-muted"}`}>
                        {daysLeft !== null ? `${daysLeft}d` : "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {tokenHealth.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">No social accounts</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Failed Posts */}
      {failures.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-danger">Failed Posts ({failures.length})</h2>
          <div className="space-y-2">
            {failures.map((f) => (
              <div key={f.id} className="rounded-lg border border-danger/30 bg-surface p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm">{f.caption || "No caption"}</p>
                    <p className="mt-1 text-xs text-muted">{f.account_name} ({f.platform}) — {f.site_name}</p>
                  </div>
                  <span className="text-xs text-muted">{new Date(f.updated_at).toLocaleString()}</span>
                </div>
                <p className="mt-2 rounded bg-danger/10 px-2 py-1 text-xs text-danger">{f.error_message}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Activity Log */}
      <section>
        <h2 className="mb-3 text-sm font-medium">Activity Log</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 font-medium">Status Change</th>
                <th className="px-4 py-2 font-medium">Notes</th>
                <th className="px-4 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-xs font-medium">{r.action}</td>
                  <td className="px-4 py-2 text-xs text-muted">{r.account_name}</td>
                  <td className="px-4 py-2 text-xs">
                    <span className="text-muted">{r.old_status}</span>
                    <span className="text-muted"> → </span>
                    <span className={r.new_status === "published" ? "text-success" : r.new_status === "failed" ? "text-danger" : ""}>
                      {r.new_status}
                    </span>
                  </td>
                  <td className="max-w-xs truncate px-4 py-2 text-xs text-muted">{r.notes || "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {recentRuns.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted">No pipeline activity yet</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
