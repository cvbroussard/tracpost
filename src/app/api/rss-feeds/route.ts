import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/rss-feeds?siteId=...
 * List RSS feeds for a site.
 */
export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const feeds = await sql`
    SELECT id, feed_url, feed_name, is_active, last_polled, created_at
    FROM rss_feeds
    WHERE business_id = ${siteId}
    ORDER BY created_at DESC
  `;

  return NextResponse.json({ feeds });
}

/**
 * POST /api/rss-feeds
 * Create or update an RSS feed.
 * Body: { siteId, feedUrl, feedName?, action?: "create" | "toggle" | "delete", feedId? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { siteId, feedUrl, feedName, action = "create", feedId } = body;

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  if (action === "create") {
    if (!feedUrl) {
      return NextResponse.json({ error: "feedUrl required" }, { status: 400 });
    }

    const [feed] = await sql`
      INSERT INTO rss_feeds (business_id, feed_url, feed_name)
      VALUES (${siteId}, ${feedUrl}, ${feedName || null})
      ON CONFLICT (business_id, feed_url) DO UPDATE SET
        feed_name = COALESCE(${feedName || null}, rss_feeds.feed_name),
        is_active = true
      RETURNING id, feed_url, feed_name, is_active
    `;

    return NextResponse.json({ feed });
  }

  if (action === "toggle" && feedId) {
    await sql`
      UPDATE rss_feeds
      SET is_active = NOT is_active
      WHERE id = ${feedId} AND business_id = ${siteId}
    `;
    return NextResponse.json({ ok: true });
  }

  if (action === "delete" && feedId) {
    await sql`
      DELETE FROM rss_feeds
      WHERE id = ${feedId} AND business_id = ${siteId}
    `;
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
