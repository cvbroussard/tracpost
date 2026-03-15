import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ContentQueuePage() {
  const [scheduled, recent, flagged] = await Promise.all([
    sql`
      SELECT sp.id, sp.caption, sp.hashtags, sp.media_urls, sp.media_type,
             sp.scheduled_at, sp.content_pillar, sp.authority,
             sa.account_name, sa.platform, s.name AS site_name
      FROM social_posts sp
      JOIN social_accounts sa ON sp.account_id = sa.id
      JOIN sites s ON sa.site_id = s.id
      WHERE sp.status = 'scheduled'
      ORDER BY sp.scheduled_at ASC
    `,
    sql`
      SELECT sp.id, sp.caption, sp.status, sp.published_at, sp.platform_post_url,
             sa.account_name, sa.platform, s.name AS site_name
      FROM social_posts sp
      JOIN social_accounts sa ON sp.account_id = sa.id
      JOIN sites s ON sa.site_id = s.id
      WHERE sp.status IN ('published', 'failed')
      ORDER BY COALESCE(sp.published_at, sp.updated_at) DESC
      LIMIT 20
    `,
    sql`
      SELECT ma.id, ma.storage_url, ma.media_type, ma.context_note, ma.flag_reason,
             ma.quality_score, ma.created_at, s.name AS site_name
      FROM media_assets ma
      JOIN sites s ON ma.site_id = s.id
      WHERE ma.triage_status = 'flagged'
      ORDER BY ma.created_at DESC
    `,
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-lg font-semibold">Content Queue</h1>
      <p className="mb-8 text-sm text-muted">Scheduled posts, recent activity, and flagged assets</p>

      {/* Flagged Assets */}
      {flagged.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-warning">Flagged Assets ({flagged.length})</h2>
          <div className="space-y-2">
            {flagged.map((f) => (
              <div key={f.id} className="rounded-lg border border-warning/30 bg-surface p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm">{f.context_note || f.media_type}</p>
                    <p className="mt-1 text-xs text-muted">
                      {f.site_name} — Quality: {f.quality_score ? (f.quality_score * 100).toFixed(0) + "%" : "—"}
                    </p>
                  </div>
                  <span className="text-xs text-muted">{new Date(f.created_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 rounded bg-warning/10 px-2 py-1 text-xs text-warning">{f.flag_reason}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Scheduled */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium">Scheduled ({scheduled.length})</h2>
        {scheduled.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Caption</th>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Pillar</th>
                  <th className="px-4 py-2 font-medium">Scheduled</th>
                  <th className="px-4 py-2 font-medium">Authority</th>
                </tr>
              </thead>
              <tbody>
                {scheduled.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="max-w-xs truncate px-4 py-2">{p.caption || "Awaiting caption"}</td>
                    <td className="px-4 py-2 text-xs text-muted">{p.account_name} ({p.platform})</td>
                    <td className="px-4 py-2">
                      <span className="rounded bg-surface px-2 py-0.5 text-xs">{p.content_pillar || "—"}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {p.scheduled_at ? new Date(p.scheduled_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs">{p.authority || "platform"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No posts scheduled</p>
        )}
      </section>

      {/* Recent */}
      <section>
        <h2 className="mb-3 text-sm font-medium">Recent Activity</h2>
        {recent.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Caption</th>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Published</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="max-w-xs truncate px-4 py-2">
                      {p.platform_post_url ? (
                        <a href={p.platform_post_url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          {p.caption || "—"}
                        </a>
                      ) : (
                        p.caption || "—"
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">{p.account_name} ({p.platform})</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs ${p.status === "published" ? "text-success" : "text-danger"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {p.published_at ? new Date(p.published_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No recent posts</p>
        )}
      </section>
    </div>
  );
}
