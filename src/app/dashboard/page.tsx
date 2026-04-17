import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AccountPortal } from "./account-portal";
import { detectContentGaps } from "@/lib/blog/content-gaps";

export const dynamic = "force-dynamic";

export default async function DashboardOverview() {
  const session = await getSession();
  if (!session) redirect("/login");

  // No active site — show account portal with site picker
  if (!session.activeSiteId) {
    return (
      <AccountPortal
        userName={session.userName}
        subscriptionName={session.subscriptionName || session.userName}
        sites={session.sites}
        plan={session.plan}
      />
    );
  }

  const siteId = session.activeSiteId;

  const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [site, accounts, postStats, assetStats, upcoming, healthData, contentGaps, blogStats] = await Promise.all([
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
    sql`
      SELECT
        (SELECT COUNT(*)::int FROM media_assets
         WHERE site_id = ${siteId} AND triage_status = 'triaged') AS triaged,
        (SELECT COUNT(*)::int FROM publishing_slots
         WHERE site_id = ${siteId} AND status = 'open'
           AND scheduled_at <= ${sevenDaysFromNow}) AS open_slots,
        (SELECT MAX(created_at) FROM media_assets
         WHERE site_id = ${siteId}) AS last_upload,
        (SELECT COUNT(*)::int FROM media_assets
         WHERE site_id = ${siteId}
           AND created_at > NOW() - INTERVAL '14 days') AS recent_uploads,
        (SELECT COUNT(*)::int FROM blog_posts
         WHERE site_id = ${siteId}
           AND status IN ('draft', 'published')) AS total_posts,
        (SELECT COUNT(DISTINCT source_asset_id)::int FROM blog_posts
         WHERE site_id = ${siteId}
           AND status IN ('draft', 'published')) AS unique_assets_used
    `,
    detectContentGaps(siteId),
    sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts,
        COUNT(*) FILTER (WHERE status = 'flagged')::int AS flagged,
        COUNT(*) FILTER (WHERE status = 'published')::int AS published
      FROM blog_posts WHERE site_id = ${siteId}
    `,
  ]);

  const p = postStats[0];
  const a = assetStats[0];
  const h = healthData[0];

  const triaged = h?.triaged || 0;
  const openSlots = h?.open_slots || 0;
  const lastUpload = h?.last_upload ? new Date(h.last_upload as string) : null;
  const recentUploads = (h?.recent_uploads as number) || 0;
  const totalPosts = (h?.total_posts as number) || 0;
  const uniqueAssetsUsed = (h?.unique_assets_used as number) || 0;

  // Days since last upload
  const daysSinceUpload = lastUpload
    ? Math.floor((Date.now() - lastUpload.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Freshness state
  let freshnessColor = "text-muted";
  let freshnessLabel = "";
  if (daysSinceUpload === null) {
    freshnessLabel = "No uploads yet";
    freshnessColor = "text-muted";
  } else if (daysSinceUpload <= 3) {
    freshnessLabel = "Content fresh";
    freshnessColor = "text-success";
  } else if (daysSinceUpload <= 7) {
    freshnessLabel = `${daysSinceUpload}d since last upload`;
    freshnessColor = "text-foreground";
  } else if (daysSinceUpload <= 14) {
    freshnessLabel = `${daysSinceUpload}d since last upload`;
    freshnessColor = "text-warning";
  } else {
    freshnessLabel = `${daysSinceUpload}d since last upload — content going stale`;
    freshnessColor = "text-danger";
  }

  // Pipeline health
  let healthColor = "bg-muted";
  let healthLabel = "No slots scheduled";
  if (openSlots > 0) {
    if (triaged === 0) {
      healthColor = "bg-danger";
      healthLabel = "Pipeline will stall";
    } else if (triaged < openSlots) {
      healthColor = "bg-warning";
      healthLabel = "Running low";
    } else {
      healthColor = "bg-success";
      healthLabel = "Pipeline healthy";
    }
  } else if (triaged > 0) {
    healthColor = "bg-success";
    healthLabel = "Content ready";
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Pipeline status */}
      <div className="mb-2 flex items-center gap-3">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${healthColor}`} />
        <span className="font-medium">{healthLabel}</span>
        <span className="text-sm text-muted">
          {triaged} ready · {openSlots} open slots · {p.scheduled} scheduled
        </span>
      </div>

      {/* Content freshness */}
      <div className="mb-6 flex items-center gap-3">
        <span className={`inline-block h-2.5 w-2.5 rounded-full ${daysSinceUpload === null ? "bg-muted" : daysSinceUpload <= 3 ? "bg-success" : daysSinceUpload <= 7 ? "bg-foreground" : daysSinceUpload <= 14 ? "bg-warning" : "bg-danger"}`} />
        <span className={`font-medium ${freshnessColor}`}>{freshnessLabel}</span>
        {totalPosts > 0 && (
          <span className="text-sm text-muted">
            {recentUploads} uploads last 14d · {uniqueAssetsUsed}/{totalPosts} unique assets in posts
          </span>
        )}
      </div>

      {/* Low inventory nudge */}
      {openSlots > 0 && triaged < openSlots && (
        <div
          className={`mb-6 rounded-lg p-3 text-sm font-medium ${
            triaged === 0
              ? "bg-danger/10 text-danger"
              : "bg-warning/10 text-warning"
          }`}
        >
          {triaged === 0
            ? `No content ready. ${openSlots} slots need content this week.`
            : `${openSlots - triaged} more assets needed to fill this week's slots.`}
        </div>
      )}

      {/* Stale content nudge */}
      {daysSinceUpload !== null && daysSinceUpload > 14 && (
        <div className="mb-6 rounded-lg bg-danger/10 p-3 text-sm font-medium text-danger">
          Your content is going stale. Upload new photos or videos to keep posts fresh and relevant.
        </div>
      )}

      {/* Key metrics */}
      <div className="mb-8 grid grid-cols-4 gap-6">
        <div>
          <p className="text-3xl font-semibold">{accounts[0].active}</p>
          <p className="mt-1 text-sm text-muted">Connected Accounts</p>
        </div>
        <div>
          <p className="text-3xl font-semibold">{p.scheduled}</p>
          <p className="mt-1 text-sm text-muted">Scheduled</p>
        </div>
        <div>
          <p className="text-3xl font-semibold text-success">{p.published}</p>
          <p className="mt-1 text-sm text-muted">Published</p>
        </div>
        <div>
          <p className={`text-3xl font-semibold ${a.ready + a.shelved > 0 ? "" : "text-warning"}`}>
            {a.ready + a.shelved}
          </p>
          <p className="mt-1 text-sm text-muted">Assets Ready</p>
        </div>
      </div>

      {/* Media Pipeline */}
      <section className="mb-8">
        <h2 className="mb-4">Media Pipeline</h2>
        <div className="grid grid-cols-4 gap-6">
          <div>
            <p className="text-2xl font-semibold">{a.received}</p>
            <p className="mt-1 text-sm text-muted">Awaiting Triage</p>
          </div>
          <div>
            <p className="text-2xl font-semibold">{a.ready}</p>
            <p className="mt-1 text-sm text-muted">Ready</p>
          </div>
          <div>
            <p className="text-2xl font-semibold">{a.shelved}</p>
            <p className="mt-1 text-sm text-muted">Shelved</p>
          </div>
          <div>
            <p className={`text-2xl font-semibold ${a.flagged > 0 ? "text-warning" : ""}`}>{a.flagged}</p>
            <p className="mt-1 text-sm text-muted">Flagged</p>
          </div>
        </div>
      </section>

      {/* Content Gap Suggestions */}
      {contentGaps.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4">Suggested Uploads</h2>
          <p className="mb-3 text-sm text-muted">
            These topics appear in your articles but don&apos;t have a dedicated deep dive yet.
          </p>
          <div className="space-y-2">
            {contentGaps.slice(0, 5).map((gap) => (
              <div
                key={gap.tag}
                className="flex items-start justify-between border-b border-border py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{gap.tagLabel}</p>
                  <p className="mt-0.5 text-xs text-muted">{gap.suggestion}</p>
                </div>
                <span className="ml-4 shrink-0 rounded bg-accent/10 px-2 py-0.5 text-xs text-accent">
                  {gap.mentionedIn.length} {gap.mentionedIn.length === 1 ? "article" : "articles"}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Blog Articles */}
      {(blogStats[0]?.drafts > 0 || blogStats[0]?.flagged > 0 || blogStats[0]?.published > 0) && (
        <section className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2>Blog Articles</h2>
            <Link href="/dashboard/blog" className="text-sm text-accent hover:underline">
              View all
            </Link>
          </div>
          <div className="flex gap-6">
            {blogStats[0]?.drafts > 0 && (
              <Link href="/dashboard/blog?status=draft" className="group">
                <p className="text-2xl font-semibold">{blogStats[0].drafts}</p>
                <p className="text-sm text-muted group-hover:text-accent">Awaiting review</p>
              </Link>
            )}
            {blogStats[0]?.flagged > 0 && (
              <Link href="/dashboard/blog?status=flagged" className="group">
                <p className="text-2xl font-semibold text-danger">{blogStats[0].flagged}</p>
                <p className="text-sm text-muted group-hover:text-accent">Flagged</p>
              </Link>
            )}
            <Link href="/dashboard/blog?status=published" className="group">
              <p className="text-2xl font-semibold text-success">{blogStats[0]?.published || 0}</p>
              <p className="text-sm text-muted group-hover:text-accent">Published</p>
            </Link>
          </div>
        </section>
      )}

      {/* Upcoming Posts */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2>Upcoming Posts</h2>
          <Link href="/dashboard/calendar" className="text-sm text-accent hover:underline">
            View calendar
          </Link>
        </div>
        {upcoming.length > 0 ? (
          <div className="space-y-2">
            {upcoming.map((post) => (
              <div key={post.id} className="flex items-start justify-between border-b border-border py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate">{post.caption || "Awaiting caption"}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {post.account_name} ({post.platform})
                    {post.content_pillar && ` · ${post.content_pillar}`}
                  </p>
                </div>
                <div className="ml-4 shrink-0 text-right">
                  <p className="text-sm text-muted">
                    {post.scheduled_at ? new Date(post.scheduled_at).toLocaleString() : "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-muted">No upcoming posts</p>
        )}
      </section>
    </div>
  );
}
