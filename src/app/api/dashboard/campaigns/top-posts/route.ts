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
    FROM site_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.site_id = ${session.activeSiteId}
      AND pa.asset_type = 'facebook_page'
      AND sa.subscription_id = ${session.subscriptionId}
  `;

  if (pages.length === 0) {
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
    pageId: string;
    pageName: string;
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

  // Top by engagement
  allPosts.sort((a, b) => b.engagement - a.engagement);
  return NextResponse.json({ posts: allPosts.slice(0, 10) });
}
