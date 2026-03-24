import { sql } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { SiteActions } from "./site-actions";

export const dynamic = "force-dynamic";

export default async function SubscriberDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [subscriber] = await sql`
    SELECT id, name, plan, is_active, metadata, created_at, updated_at
    FROM subscribers WHERE id = ${id}
  `;

  if (!subscriber) notFound();

  const [sites, accounts, recentPosts, usage] = await Promise.all([
    sql`
      SELECT id, name, url, autopilot_enabled, deleted_at, deletion_status, deletion_requested_at, deletion_reason, created_at
      FROM sites WHERE subscriber_id = ${id}
      ORDER BY deleted_at ASC NULLS FIRST, created_at DESC
    `,
    sql`
      SELECT sa.id, sa.platform, sa.account_name, sa.status, sa.token_expires_at
      FROM social_accounts sa
      WHERE sa.subscriber_id = ${id}
      ORDER BY sa.created_at DESC
    `,
    sql`
      SELECT sp.id, sp.status, sp.caption, sp.scheduled_at, sp.published_at,
             sa.account_name, sa.platform
      FROM social_posts sp
      JOIN social_accounts sa ON sp.account_id = sa.id
      WHERE sa.subscriber_id = ${id}
      ORDER BY sp.created_at DESC
      LIMIT 10
    `,
    sql`
      SELECT action, COUNT(*)::int AS count
      FROM usage_log
      WHERE subscriber_id = ${id}
      GROUP BY action
      ORDER BY count DESC
    `,
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8">
        <Link href="/admin/subscribers" className="text-xs text-muted hover:text-accent">
          &larr; Subscribers
        </Link>
        <h1 className="mt-2 text-lg font-semibold">{subscriber.name}</h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted">
          <span className="rounded bg-surface px-2 py-0.5 text-xs">{subscriber.plan}</span>
          <span className={subscriber.is_active ? "text-success" : "text-danger"}>
            {subscriber.is_active ? "Active" : "Inactive"}
          </span>
          <span>Since {new Date(subscriber.created_at).toLocaleDateString()}</span>
        </div>
      </div>

      {/* Sites */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Sites ({sites.length})</h2>
          <Link
            href={`/admin/subscribers/${id}/sites/new`}
            className="rounded border border-border px-3 py-1 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            Add Site
          </Link>
        </div>
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">URL</th>
                <th className="px-4 py-2 font-medium">Autopilot</th>
                <th className="px-4 py-2 font-medium">Created</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sites.map((site) => {
                const isDeleted = !!site.deleted_at;
                return (
                  <tr key={site.id} className={`border-b border-border last:border-0 ${isDeleted ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2 font-medium">
                      {site.name}
                      {isDeleted && (
                        <span className="ml-2 rounded bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">deleted</span>
                      )}
                      {site.deletion_status === "pending" && !isDeleted && (
                        <span className="ml-2 rounded bg-warning/10 px-1.5 py-0.5 text-[10px] text-warning" title={site.deletion_reason ? `Reason: ${site.deletion_reason}` : undefined}>
                          deletion requested
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">{site.url}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs ${site.autopilot_enabled ? "text-success" : "text-muted"}`}>
                        {site.autopilot_enabled ? "On" : "Off"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {new Date(site.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <SiteActions siteId={site.id} siteName={site.name} isDeleted={isDeleted} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Social Accounts */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium">Social Accounts ({accounts.length})</h2>
        {accounts.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Platform</th>
                  <th className="px-4 py-2 font-medium">Site</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Token Expires</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 font-medium">{acc.account_name}</td>
                    <td className="px-4 py-2 text-xs">{acc.platform}</td>
                    <td className="px-4 py-2 text-xs text-muted">{acc.platform}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs ${acc.status === "active" ? "text-success" : "text-danger"}`}>
                        {acc.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {acc.token_expires_at ? new Date(acc.token_expires_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No accounts connected</p>
        )}
      </section>

      {/* Recent Posts */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium">Recent Posts</h2>
        {recentPosts.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Caption</th>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {recentPosts.map((post) => (
                  <tr key={post.id} className="border-b border-border last:border-0">
                    <td className="max-w-xs truncate px-4 py-2">{post.caption || "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted">{post.account_name}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs ${
                        post.status === "published" ? "text-success"
                          : post.status === "failed" ? "text-danger"
                          : "text-warning"
                      }`}>
                        {post.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted">
                      {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">No posts yet</p>
        )}
      </section>

      {/* Usage */}
      {usage.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium">Usage Summary</h2>
          <div className="grid grid-cols-4 gap-3">
            {usage.map((u) => (
              <div key={u.action} className="rounded-lg border border-border bg-surface p-3 text-center">
                <p className="text-lg font-semibold">{u.count}</p>
                <p className="text-[10px] text-muted">{u.action}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
