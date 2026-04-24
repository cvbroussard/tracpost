import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  const [site] = await sql`
    SELECT s.id, s.gsc_property, s.gsc_verification_token,
           s.autopilot_enabled, s.gbp_sync_dirty, s.gbp_dirty_fields,
           bs.custom_domain
    FROM sites s
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE s.id = ${siteId}
  `;

  if (!site) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [gbpAccount] = await sql`
    SELECT sa.id, sa.token_expires_at
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp'
    ORDER BY sa.created_at DESC
    LIMIT 1
  `.catch(() => [null]);

  const gbpConnected = !!gbpAccount;
  const tokenOk = gbpAccount?.token_expires_at
    ? new Date(gbpAccount.token_expires_at) > new Date()
    : false;

  const [photoStats] = await sql`
    SELECT COUNT(*)::int AS total_synced
    FROM gbp_photo_sync
    WHERE site_id = ${siteId}
  `.catch(() => [{ total_synced: 0 }]);

  const [reviewStats] = await sql`
    SELECT COUNT(*) FILTER (WHERE reply_status = 'pending')::int AS pending_replies
    FROM inbox_reviews
    WHERE site_id = ${siteId}
  `.catch(() => [{ pending_replies: 0 }]);

  const [counts] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM page_scores WHERE site_id = ${siteId}) AS pages_scored,
      (SELECT COUNT(*)::int FROM search_performance WHERE site_id = ${siteId}) AS search_rows,
      (SELECT COUNT(*)::int FROM media_assets WHERE site_id = ${siteId}) AS total_assets,
      (SELECT COUNT(*)::int FROM blog_posts WHERE site_id = ${siteId}) AS total_posts
  `;

  const [playbook] = await sql`
    SELECT id FROM brand_playbooks WHERE site_id = ${siteId} LIMIT 1
  `.catch(() => [null]);

  const dirtyFields = (site.gbp_dirty_fields || []) as string[];

  return NextResponse.json({
    gbp: {
      connected: gbpConnected,
      tokenOk,
      dirty: site.gbp_sync_dirty || false,
      dirtyFields,
      pendingReplies: reviewStats?.pending_replies || 0,
      photosSynced: photoStats?.total_synced || 0,
      gscVerified: !!site.gsc_property,
    },
    seo: {
      pagesScored: counts.pages_scored || 0,
      searchRows: counts.search_rows || 0,
      customDomain: site.custom_domain || null,
      gscProperty: site.gsc_property || null,
    },
    content: {
      hasPlaybook: !!playbook,
      totalAssets: counts.total_assets || 0,
      totalPosts: counts.total_posts || 0,
      autopilotEnabled: !!site.autopilot_enabled,
    },
  });
}
