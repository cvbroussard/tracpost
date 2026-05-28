import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

interface FbPostRaw {
  id: string;
  message?: string;
  full_picture?: string;
  permalink_url?: string;
  created_time?: string;
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
  insights?: { data?: Array<{ name: string; values?: Array<{ value?: number }> }> };
}

/**
 * GET /api/dashboard/campaigns/top-posts
 *
 * Lists organic FB Page posts (with engagement signals) for boost-winners
 * candidate selection. Phase A: surfaces real data; Phase C wires the
 * boost flow that consumes a selected post and creates a campaign from it.
 *
 * Each connected FB Page has its own Page Access Token in
 * platform_assets.metadata.page_access_token; we hit /{pageId}/posts
 * directly with that token.
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!session.activeSiteId) {
    return NextResponse.json({ error: "No active site" }, { status: 400 });
  }

  const pages = await sql`
    SELECT pa.asset_id AS page_id, pa.asset_name AS page_name, pa.metadata
    FROM business_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.business_id = ${session.activeSiteId}
      AND pa.asset_type = 'facebook_page'
      AND sa.billing_account_id = ${session.subscriptionId}
  `;

  const igAccounts = await sql`
    SELECT pa.asset_id AS ig_user_id, pa.asset_name AS ig_username, pa.metadata
    FROM business_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.business_id = ${session.activeSiteId}
      AND pa.asset_type = 'instagram_account'
      AND sa.billing_account_id = ${session.subscriptionId}
  `;

  if (pages.length === 0 && igAccounts.length === 0) {
    return NextResponse.json({ posts: [] });
  }

  const fields = [
    "id",
    "message",
    "full_picture",
    "permalink_url",
    "created_time",
    "reactions.summary(true)",
    "comments.summary(true)",
    "shares",
  ].join(",");

  const allPosts: Array<{
    id: string;
    platform: string;
    pageId: string | null;        // FB Page ID (FB posts only)
    pageName: string | null;
    igUserId: string | null;      // IG Business account ID (IG posts only)
    igUsername: string | null;
    igMediaId: string | null;     // IG media ID (IG posts only)
    caption: string;
    image: string | null;
    permalinkUrl: string | null;
    createdTime: string;
    engagement: number;
  }> = [];

  for (const page of pages) {
    const meta = (page.metadata || {}) as Record<string, unknown>;
    const pageToken = meta.page_access_token as string | undefined;
    if (!pageToken) continue;

    try {
      const res = await fetch(
        `${GRAPH_BASE}/${page.page_id}/posts?fields=${fields}&limit=25&access_token=${pageToken}`
      );
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.data)) continue;

      for (const raw of data.data as FbPostRaw[]) {
        const reactions = raw.reactions?.summary?.total_count ?? 0;
        const comments = raw.comments?.summary?.total_count ?? 0;
        const shares = raw.shares?.count ?? 0;
        allPosts.push({
          id: raw.id,
          platform: "facebook",
          pageId: page.page_id as string,
          pageName: page.page_name as string,
          igUserId: null,
          igUsername: null,
          igMediaId: null,
          caption: raw.message ?? "",
          image: raw.full_picture ?? null,
          permalinkUrl: raw.permalink_url ?? null,
          createdTime: raw.created_time ?? "",
          engagement: reactions + comments + shares,
        });
      }
    } catch {
      // Skip pages that fail; partial results are better than total failure
    }
  }

  // ── Instagram media ─────────────────────────────────────────────────
  const igFields = [
    "id",
    "caption",
    "media_url",
    "thumbnail_url",
    "permalink",
    "timestamp",
    "like_count",
    "comments_count",
  ].join(",");

  for (const acct of igAccounts) {
    const meta = (acct.metadata || {}) as Record<string, unknown>;
    // IG publishing uses the linked Page's access token (organic Meta callback stores it)
    const igToken = meta.page_access_token as string | undefined;
    if (!igToken) continue;

    try {
      const res = await fetch(
        `${GRAPH_BASE}/${acct.ig_user_id}/media?fields=${igFields}&limit=25&access_token=${igToken}`
      );
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.data)) continue;

      for (const raw of data.data as Record<string, unknown>[]) {
        const likeCount = Number(raw.like_count ?? 0);
        const commentsCount = Number(raw.comments_count ?? 0);
        allPosts.push({
          id: String(raw.id),
          platform: "instagram",
          pageId: null,
          pageName: null,
          igUserId: acct.ig_user_id as string,
          igUsername: acct.ig_username as string,
          igMediaId: String(raw.id),
          caption: String(raw.caption ?? ""),
          image: (raw.media_url as string) ?? (raw.thumbnail_url as string) ?? null,
          permalinkUrl: (raw.permalink as string) ?? null,
          createdTime: String(raw.timestamp ?? ""),
          engagement: likeCount + commentsCount,
        });
      }
    } catch {
      // partial-results-better-than-total-failure same as FB branch
    }
  }

  // Top by engagement, mixed across platforms
  allPosts.sort((a, b) => b.engagement - a.engagement);
  return NextResponse.json({ posts: allPosts.slice(0, 10) });
}
