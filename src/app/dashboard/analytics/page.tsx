import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { PlatformIcon } from "@/components/platform-icons";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  const [overallStats, platformBreakdown, topPosts, recentActivity] = await Promise.all([
    // Overall publishing stats
    sql`
      SELECT
        COUNT(*) FILTER (WHERE sp.status = 'published')::int AS total_published,
        COUNT(*) FILTER (WHERE sp.status = 'scheduled')::int AS total_scheduled,
        COUNT(*) FILTER (WHERE sp.status = 'failed')::int AS total_failed,
        COUNT(*) FILTER (WHERE sp.published_at > NOW() - INTERVAL '7 days')::int AS published_7d,
        COUNT(*) FILTER (WHERE sp.published_at > NOW() - INTERVAL '30 days')::int AS published_30d
      FROM social_posts sp
      JOIN social_accounts sa ON sp.account_id = sa.id
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId}
    `,
    // Posts by platform
    sql`
      SELECT sa.platform,
             COUNT(*) FILTER (WHERE sp.status = 'published')::int AS published,
             COUNT(*) FILTER (WHERE sp.status = 'scheduled')::int AS scheduled
      FROM social_posts sp
      JOIN social_accounts sa ON sp.account_id = sa.id
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId}
      GROUP BY sa.platform
      ORDER BY published DESC
    `,
    // Top posts (most recent published with analytics if available)
    sql`
      SELECT sp.id, sp.caption, sp.published_at, sp.platform_post_url, sp.media_urls,
             sa.platform, sa.account_name,
             pa.likes, pa.comments, pa.shares, pa.reach
      FROM social_posts sp
      JOIN social_accounts sa ON sp.account_id = sa.id
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      LEFT JOIN LATERAL (
        SELECT likes, comments, shares, reach
        FROM post_analytics
        WHERE post_id = sp.id
        ORDER BY collected_at DESC
        LIMIT 1
      ) pa ON true
      WHERE ssl.site_id = ${siteId} AND sp.status = 'published'
      ORDER BY sp.published_at DESC
      LIMIT 10
    `,
    // Blog stats
    sql`
      SELECT
        COUNT(*)::int AS total_posts,
        COUNT(*) FILTER (WHERE status = 'published')::int AS published_posts,
        COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_posts
      FROM blog_posts
      WHERE site_id = ${siteId}
    `,
  ]);

  const stats = overallStats[0];
  const blog = recentActivity[0];

  return (
    <div className="mx-auto max-w-4xl">
      <h1>Analytics</h1>
      <p className="mt-2 mb-8 text-muted">Publishing performance and content metrics</p>

      {/* Key metrics */}
      <div className="mb-8 grid grid-cols-5 gap-6">
        <div>
          <p className="text-3xl font-semibold">{stats.total_published}</p>
          <p className="text-sm text-muted">Published</p>
        </div>
        <div>
          <p className="text-3xl font-semibold">{stats.published_7d}</p>
          <p className="text-sm text-muted">This week</p>
        </div>
        <div>
          <p className="text-3xl font-semibold">{stats.published_30d}</p>
          <p className="text-sm text-muted">This month</p>
        </div>
        <div>
          <p className="text-3xl font-semibold">{stats.total_scheduled}</p>
          <p className="text-sm text-muted">Scheduled</p>
        </div>
        <div>
          <p className={`text-3xl font-semibold ${stats.total_failed > 0 ? "text-danger" : ""}`}>
            {stats.total_failed}
          </p>
          <p className="text-sm text-muted">Failed</p>
        </div>
      </div>

      {/* Platform breakdown */}
      {platformBreakdown.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-4">By Platform</h2>
          <div className="flex flex-wrap gap-6">
            {platformBreakdown.map((p) => (
              <div key={p.platform as string} className="flex items-center gap-3">
                <PlatformIcon platform={p.platform as string} size={20} />
                <div>
                  <p className="text-xl font-semibold">{p.published as number}</p>
                  <p className="text-sm text-muted">
                    {p.platform as string}
                    {(p.scheduled as number) > 0 && ` · ${p.scheduled} scheduled`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Blog stats */}
      <section className="mb-8">
        <h2 className="mb-4">Blog</h2>
        <div className="flex gap-6">
          <div>
            <p className="text-2xl font-semibold">{blog.published_posts}</p>
            <p className="text-sm text-muted">Published posts</p>
          </div>
          <div>
            <p className="text-2xl font-semibold">{blog.draft_posts}</p>
            <p className="text-sm text-muted">Drafts</p>
          </div>
          <div>
            <p className="text-2xl font-semibold">{blog.total_posts}</p>
            <p className="text-sm text-muted">Total</p>
          </div>
        </div>
      </section>

      {/* Recent published posts */}
      <section>
        <h2 className="mb-4">Recent Posts</h2>
        {topPosts.length === 0 ? (
          <p className="py-8 text-center text-muted">No published posts yet</p>
        ) : (
          <div>
            {topPosts.map((post) => (
              <div key={post.id as string} className="border-b border-border py-4 last:border-0">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Thumbnail with platform badge */}
                    <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-surface-hover">
                      {(post.media_urls as string[])?.[0] ? (
                        <img
                          src={(post.media_urls as string[])[0]}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted">
                          <PlatformIcon platform={post.platform as string} size={20} />
                        </div>
                      )}
                      <div className="absolute top-0.5 right-0.5 rounded-full bg-background/80 p-0.5">
                        <PlatformIcon platform={post.platform as string} size={10} />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{(post.caption as string)?.slice(0, 100) || "No caption"}</p>
                      <p className="mt-1 flex items-center gap-2 text-sm text-muted">
                        <span>{post.account_name as string} · {post.published_at
                          ? new Date(post.published_at as string).toLocaleDateString()
                          : "—"}</span>
                        {post.platform_post_url && (
                          <a
                            href={post.platform_post_url as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-accent hover:text-accent/80"
                          >
                            View ↗
                          </a>
                        )}
                      </p>
                    </div>
                  </div>
                  {/* Engagement metrics if available */}
                  {post.likes !== null && (
                    <div className="flex gap-4 text-sm text-muted">
                      {(post.likes as number) > 0 && <span>{post.likes} likes</span>}
                      {(post.comments as number) > 0 && <span>{post.comments} comments</span>}
                      {(post.shares as number) > 0 && <span>{post.shares} shares</span>}
                      {(post.reach as number) > 0 && <span>{post.reach} reach</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
