import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { UnipostDashboard } from "../unipost/unipost-dashboard";

export const dynamic = "force-dynamic";

/**
 * Unifeed — the commingled review surface for everything published.
 *
 * Phase 3 of the publish-module refactor (task #82). Renamed from
 * "Unipost" because it now includes blog articles alongside social
 * posts. The grid renders all content types in the same shape:
 * thumbnail + caption + platform badge + status. Each card's preview
 * varies by content type when clicked.
 *
 * Data source: UNION of social_posts (existing) + blog_posts (new).
 * Both projected to the same PostItem shape for the dashboard.
 *
 * Routes:
 *   /dashboard/unifeed              → this page (commingled view)
 *   /dashboard/unipost              → redirects here (legacy alias)
 *
 * Future phases:
 *   - Platform filter chips at top (next chunk)
 *   - Dedicated article review surface for long-form proofing
 *   - Eventual deprecation of /dashboard/blog sidebar entry
 */
export default async function UnifeedPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="p-4 space-y-6">
        <h1 className="mb-1 text-lg font-semibold">Unifeed</h1>
        <p className="py-12 text-center text-sm text-muted">Add a business first.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  // Aggregated metrics (social posts only — followers count is a social
  // concept; articles don't have followers in the same sense)
  const [metrics] = await sql`
    SELECT
      (SELECT COALESCE(SUM(
        COALESCE((sa.metadata->>'followers_count')::int, 0)
      ), 0)::int
      FROM social_accounts sa
      WHERE sa.id IN (
        SELECT account_id FROM social_posts WHERE site_id = ${siteId}
      ) AND sa.status = 'active'
      ) AS total_followers,
      (SELECT
         (SELECT COUNT(*)::int FROM social_posts
          WHERE site_id = ${siteId} AND status = 'published'
          AND published_at > NOW() - INTERVAL '7 days')
       +
         (SELECT COUNT(*)::int FROM blog_posts
          WHERE site_id = ${siteId} AND status = 'published'
          AND published_at > NOW() - INTERVAL '7 days')
      ) AS posts_this_week,
      (SELECT
         (SELECT COUNT(*)::int FROM social_posts WHERE site_id = ${siteId} AND status = 'published')
       +
         (SELECT COUNT(*)::int FROM blog_posts WHERE site_id = ${siteId} AND status = 'published')
      ) AS total_posts
  `;

  // Recent published items — UNION of social_posts + blog_posts.
  // Both projected to a normalized shape the dashboard can render uniformly.
  const recentPosts = await sql`
    SELECT *
    FROM (
      -- Social posts
      SELECT sp.id::text AS id,
             sp.caption AS caption,
             COALESCE(((sp.media_urls)::text[])[1], ma.storage_url) AS media_url,
             COALESCE(sp.metadata->>'platform', sa.platform) AS platform,
             COALESCE(sa.account_name, '') AS account_name,
             sp.status AS status,
             sp.published_at AS published_at,
             sp.scheduled_at AS scheduled_at,
             sp.created_at AS created_at,
             sp.platform_post_url AS platform_post_url,
             sp.error_message AS error_message
      FROM social_posts sp
      LEFT JOIN social_accounts sa ON sp.account_id = sa.id
      LEFT JOIN media_assets ma ON ma.id = sp.source_asset_id
      WHERE sp.site_id = ${siteId}
        AND sp.status IN ('published', 'scheduled', 'failed', 'draft', 'held')

      UNION ALL

      -- Blog articles. platform_post_url points at the internal review
      -- surface (/dashboard/unifeed/article/[id]) so clicking a card
      -- opens the long-form proofing view rather than the live URL.
      -- The review surface itself surfaces a "View live ↗" button when
      -- the article is published.
      SELECT bp.id::text AS id,
             COALESCE(bp.title, bp.excerpt) AS caption,
             bp.og_image_url AS media_url,
             'blog'::text AS platform,
             COALESCE(bs.blog_title, '') AS account_name,
             bp.status AS status,
             bp.published_at AS published_at,
             NULL::timestamptz AS scheduled_at,
             bp.created_at AS created_at,
             ('/dashboard/unifeed/article/' || bp.id::text) AS platform_post_url,
             NULL::text AS error_message
      FROM blog_posts bp
      LEFT JOIN blog_settings bs ON bs.site_id = bp.site_id
      WHERE bp.site_id = ${siteId}
        AND bp.status IN ('published', 'draft')
    ) feed
    ORDER BY COALESCE(published_at, scheduled_at, created_at) DESC NULLS LAST
    LIMIT 100
  `;

  // Connected platforms — show assigned assets first (new model),
  // then any legacy site_social_links not yet migrated.
  const assignedPlatforms = await sql`
    SELECT pa.platform, pa.asset_name AS account_name, sa.status,
           NULL AS followers
    FROM site_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.site_id = ${siteId}
      AND spa.is_primary = true
  `;
  const legacyPlatforms = await sql`
    SELECT sa.platform, sa.account_name, sa.status,
           sa.metadata->>'followers_count' AS followers
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId}
  `;
  const platformSet = new Set(assignedPlatforms.map(p => p.platform));
  const platforms = [
    ...assignedPlatforms,
    ...legacyPlatforms.filter(p => !platformSet.has(p.platform)),
  ];

  // Add a synthetic "blog" platform tile if any blog content exists
  const [blogPresence] = await sql`
    SELECT COUNT(*)::int AS n FROM blog_posts WHERE site_id = ${siteId}
  `;
  if ((blogPresence?.n as number) > 0) {
    const [bs] = await sql`SELECT blog_title FROM blog_settings WHERE site_id = ${siteId}`;
    platforms.push({
      platform: "blog",
      account_name: (bs?.blog_title as string) || "Blog",
      status: "active",
      followers: null,
    });
  }

  // Posts grouped by source asset (campaign view) — social only,
  // since blog articles aren't typically grouped by source asset
  const campaignGroups = await sql`
    SELECT sp.source_asset_id,
           ma.storage_url AS source_image_url,
           ma.context_note,
           COUNT(*)::int AS platform_count,
           COUNT(*) FILTER (WHERE sp.status = 'published')::int AS published_count,
           MIN(sp.published_at) AS first_published,
           ARRAY_AGG(DISTINCT COALESCE(sp.metadata->>'platform', sa.platform)) AS platforms
    FROM social_posts sp
    LEFT JOIN social_accounts sa ON sp.account_id = sa.id
    LEFT JOIN media_assets ma ON ma.id = sp.source_asset_id
    WHERE sp.site_id = ${siteId}
      AND sp.source_asset_id IS NOT NULL
      AND sp.status = 'published'
    GROUP BY sp.source_asset_id, ma.storage_url, ma.context_note
    ORDER BY MIN(sp.published_at) DESC NULLS LAST
    LIMIT 30
  `;

  return (
    <div className="p-4 space-y-6">
      <div className="mb-6">
        <h1 className="mb-1 text-lg font-semibold">Unifeed</h1>
        <p className="text-sm text-muted">
          All published content — posts and articles, every platform, one view.
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
          caption: p.caption ? String(p.caption) : null,
          mediaUrl: p.media_url ? String(p.media_url) : null,
          platform: String(p.platform),
          accountName: String(p.account_name),
          status: String(p.status) as "published" | "scheduled" | "failed" | "draft" | "held",
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
