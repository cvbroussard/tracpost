import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { UnipostDashboard } from "./unipost-dashboard";

export const dynamic = "force-dynamic";

export default async function UnipostPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-1 text-lg font-semibold">Unipost</h1>
        <p className="py-12 text-center text-sm text-muted">Add a site first.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  // Aggregated metrics
  const [metrics] = await sql`
    SELECT
      (SELECT COALESCE(SUM(
        COALESCE((sa.metadata->>'followers_count')::int, 0)
      ), 0)::int
      FROM social_accounts sa
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId} AND sa.status = 'active'
      ) AS total_followers,
      (SELECT COUNT(*)::int FROM social_posts sp
       JOIN social_accounts sa ON sp.account_id = sa.id
       JOIN site_social_links ssl ON ssl.social_account_id = sa.id
       WHERE ssl.site_id = ${siteId} AND sp.status = 'published'
       AND sp.published_at > NOW() - INTERVAL '7 days'
      ) AS posts_this_week,
      (SELECT COUNT(*)::int FROM social_posts sp
       JOIN social_accounts sa ON sp.account_id = sa.id
       JOIN site_social_links ssl ON ssl.social_account_id = sa.id
       WHERE ssl.site_id = ${siteId} AND sp.status = 'published'
      ) AS total_posts
  `;

  // Recent posts across all platforms (firehose data)
  const recentPosts = await sql`
    SELECT sp.id, sp.caption, sp.media_urls, sp.media_type, sp.platform_post_url,
           sp.published_at, sp.status, sp.error_message,
           sa.platform, sa.account_name,
           ma.storage_url AS source_image_url, ma.variants AS asset_variants
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    LEFT JOIN media_assets ma ON ma.id = sp.source_asset_id
    WHERE ssl.site_id = ${siteId}
      AND sp.status IN ('published', 'scheduled', 'failed', 'draft')
    ORDER BY COALESCE(sp.published_at, sp.scheduled_at, sp.created_at) DESC NULLS LAST
    LIMIT 100
  `;

  // Connected platforms
  const platforms = await sql`
    SELECT sa.platform, sa.account_name, sa.status,
           sa.metadata->>'followers_count' AS followers
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId}
    ORDER BY sa.platform
  `;

  // Posts grouped by source asset (campaign view data)
  const campaignGroups = await sql`
    SELECT sp.source_asset_id,
           ma.storage_url AS source_image_url,
           ma.context_note,
           COUNT(*)::int AS platform_count,
           COUNT(*) FILTER (WHERE sp.status = 'published')::int AS published_count,
           MIN(sp.published_at) AS first_published,
           ARRAY_AGG(DISTINCT sa.platform) AS platforms
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    LEFT JOIN media_assets ma ON ma.id = sp.source_asset_id
    WHERE ssl.site_id = ${siteId}
      AND sp.source_asset_id IS NOT NULL
      AND sp.status = 'published'
    GROUP BY sp.source_asset_id, ma.storage_url, ma.context_note
    ORDER BY MIN(sp.published_at) DESC NULLS LAST
    LIMIT 30
  `;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="mb-1 text-lg font-semibold">Unipost</h1>
        <p className="text-sm text-muted">
          All platforms, one view.
        </p>
      </div>

      <UnipostDashboard
        metrics={{
          totalFollowers: (metrics?.total_followers as number) || 0,
          postsThisWeek: (metrics?.posts_this_week as number) || 0,
          totalPosts: (metrics?.total_posts as number) || 0,
        }}
        recentPosts={recentPosts.map((p) => ({
          id: String(p.id),
          caption: p.caption ? String(p.caption).slice(0, 200) : null,
          mediaUrl: ((p.media_urls as string[]) || [])[0] || (p.source_image_url ? String(p.source_image_url) : null),
          platform: String(p.platform),
          accountName: String(p.account_name),
          status: String(p.status) as "published" | "scheduled" | "failed" | "draft",
          publishedAt: p.published_at ? String(p.published_at) : null,
          platformPostUrl: p.platform_post_url ? String(p.platform_post_url) : null,
          errorMessage: p.error_message ? String(p.error_message) : null,
        }))}
        platforms={platforms.map((p) => ({
          platform: String(p.platform),
          accountName: String(p.account_name),
          status: String(p.status),
          followers: p.followers ? Number(p.followers) : null,
        }))}
        campaignGroups={campaignGroups.map((g) => ({
          sourceAssetId: g.source_asset_id ? String(g.source_asset_id) : null,
          sourceImageUrl: g.source_image_url ? String(g.source_image_url) : null,
          contextNote: g.context_note ? String(g.context_note).slice(0, 100) : null,
          platformCount: g.platform_count as number,
          publishedCount: g.published_count as number,
          firstPublished: g.first_published ? String(g.first_published) : null,
          platforms: (g.platforms as string[]) || [],
        }))}
      />
    </div>
  );
}
