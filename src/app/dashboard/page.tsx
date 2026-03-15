import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AddSiteForm } from "./add-site";

export const dynamic = "force-dynamic";

export default async function DashboardOverview() {
  const session = await getSession();
  if (!session) redirect("/login");

  // No site yet — inline form to add one
  if (!session.activeSiteId) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-lg font-semibold">Welcome, {session.subscriberName}</h1>
        <p className="mb-8 text-sm text-muted">Let&apos;s get started by adding your blog.</p>
        <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-8 py-12">
          <span className="mb-3 text-3xl">◆</span>
          <h3 className="mb-1 text-sm font-medium">Add your blog</h3>
          <p className="mb-6 max-w-xs text-center text-xs text-muted">
            Enter your blog URL to start generating social content from your posts.
          </p>
          <AddSiteForm />
        </div>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [site, accounts, postStats, assetStats, upcoming] = await Promise.all([
    sql`SELECT name, url, autopilot_enabled FROM sites WHERE id = ${siteId}`,
    sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'active')::int AS active
      FROM social_accounts WHERE site_id = ${siteId}
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE sp.status = 'scheduled')::int AS scheduled,
        COUNT(*) FILTER (WHERE sp.status = 'published')::int AS published,
        COUNT(*) FILTER (WHERE sp.status = 'failed')::int AS failed,
        COUNT(*) FILTER (WHERE sp.status = 'vetoed')::int AS vetoed
      FROM social_posts sp
      JOIN social_accounts sa ON sp.account_id = sa.id
      WHERE sa.site_id = ${siteId}
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE triage_status = 'received')::int AS received,
        COUNT(*) FILTER (WHERE triage_status = 'triaged')::int AS ready,
        COUNT(*) FILTER (WHERE triage_status = 'shelved')::int AS shelved,
        COUNT(*) FILTER (WHERE triage_status = 'flagged')::int AS flagged
      FROM media_assets WHERE site_id = ${siteId}
    `,
    sql`
      SELECT sp.id, sp.caption, sp.scheduled_at, sp.content_pillar, sp.status,
             sa.account_name, sa.platform
      FROM social_posts sp
      JOIN social_accounts sa ON sp.account_id = sa.id
      WHERE sa.site_id = ${siteId} AND sp.status = 'scheduled'
      ORDER BY sp.scheduled_at ASC
      LIMIT 5
    `,
  ]);

  const siteName = site[0]?.name || "Your Site";
  const p = postStats[0];
  const a = assetStats[0];

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">{siteName}</h1>
      <p className="mb-8 text-sm text-muted">
        {site[0]?.autopilot_enabled
          ? "Autopilot is active — content publishes automatically"
          : "Autopilot is off"}
      </p>

      <div className="mb-8 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-semibold">{accounts[0].active}</p>
          <p className="text-xs text-muted">Connected Accounts</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-semibold">{p.scheduled}</p>
          <p className="text-xs text-muted">Scheduled</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <p className="text-2xl font-semibold text-success">{p.published}</p>
          <p className="text-xs text-muted">Published</p>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4 text-center">
          <p className={`text-2xl font-semibold ${a.ready + a.shelved > 0 ? "" : "text-warning"}`}>
            {a.ready + a.shelved}
          </p>
          <p className="text-xs text-muted">Assets Ready</p>
        </div>
      </div>

      <div className="mb-8 rounded-lg border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium">Media Pipeline</h2>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-lg font-semibold">{a.received}</p>
            <p className="text-[10px] text-muted">Awaiting Triage</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{a.ready}</p>
            <p className="text-[10px] text-muted">Ready</p>
          </div>
          <div>
            <p className="text-lg font-semibold">{a.shelved}</p>
            <p className="text-[10px] text-muted">Shelved</p>
          </div>
          <div>
            <p className={`text-lg font-semibold ${a.flagged > 0 ? "text-warning" : ""}`}>{a.flagged}</p>
            <p className="text-[10px] text-muted">Flagged</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Upcoming Posts</h2>
          <Link href="/dashboard/calendar" className="text-xs text-accent hover:underline">
            View calendar
          </Link>
        </div>
        {upcoming.length > 0 ? (
          <div className="space-y-3">
            {upcoming.map((post) => (
              <div key={post.id} className="flex items-start justify-between rounded border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{post.caption || "Awaiting caption"}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {post.account_name} ({post.platform})
                    {post.content_pillar && ` — ${post.content_pillar}`}
                  </p>
                </div>
                <div className="ml-4 shrink-0 text-right">
                  <p className="text-xs text-muted">
                    {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString() : "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-muted">No upcoming posts</p>
        )}
      </div>
    </div>
  );
}
