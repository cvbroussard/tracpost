import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  const [bySubscriber, byAction, recent] = await Promise.all([
    sql`
      SELECT sub.name, sub.plan,
             COUNT(ul.id)::int AS total_actions,
             MAX(ul.created_at) AS last_action
      FROM subscribers sub
      LEFT JOIN usage_log ul ON ul.subscriber_id = sub.id
      WHERE sub.is_active = true
      GROUP BY sub.id, sub.name, sub.plan
      ORDER BY total_actions DESC
    `,
    sql`
      SELECT action, COUNT(*)::int AS count
      FROM usage_log
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY action
      ORDER BY count DESC
    `,
    sql`
      SELECT ul.action, ul.metadata, ul.created_at,
             sub.name AS subscriber_name, s.name AS site_name
      FROM usage_log ul
      JOIN subscribers sub ON ul.subscriber_id = sub.id
      LEFT JOIN sites s ON ul.site_id = s.id
      ORDER BY ul.created_at DESC
      LIMIT 30
    `,
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-lg font-semibold">Usage & Billing</h1>
      <p className="mb-8 text-sm text-muted">API usage, action logs, and billing metrics</p>

      {/* By Subscriber */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium">Usage by Subscriber</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Subscriber</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium text-center">Actions (all time)</th>
                <th className="px-4 py-3 font-medium">Last Activity</th>
              </tr>
            </thead>
            <tbody>
              {bySubscriber.map((s) => (
                <tr key={s.name} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-surface px-2 py-0.5 text-xs">{s.plan}</span>
                  </td>
                  <td className="px-4 py-3 text-center">{s.total_actions}</td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {s.last_action ? new Date(s.last_action).toLocaleString() : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Action Breakdown (30 days) */}
      {byAction.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium">Actions (Last 30 Days)</h2>
          <div className="grid grid-cols-4 gap-3">
            {byAction.map((a) => (
              <div key={a.action} className="rounded-lg border border-border bg-surface p-4 text-center">
                <p className="text-xl font-semibold">{a.count}</p>
                <p className="text-[10px] text-muted">{a.action}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Log */}
      <section>
        <h2 className="mb-3 text-sm font-medium">Recent Activity</h2>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Subscriber</th>
                <th className="px-4 py-2 font-medium">Site</th>
                <th className="px-4 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 text-xs font-medium">{r.action}</td>
                  <td className="px-4 py-2 text-xs text-muted">{r.subscriber_name}</td>
                  <td className="px-4 py-2 text-xs text-muted">{r.site_name || "—"}</td>
                  <td className="px-4 py-2 text-xs text-muted">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted">No usage logged</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
