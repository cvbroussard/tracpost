import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { CommentsListClient, type PostGroup } from "./comments-list-client";

export const dynamic = "force-dynamic";

export default async function CommentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  const postGroups = await sql`
    SELECT
      ic.platform_post_id,
      ic.platform,
      sp.id AS post_id,
      sp.caption,
      sp.media_urls,
      sp.platform_post_url,
      COUNT(*)::int AS comment_count,
      COUNT(*) FILTER (WHERE ic.is_read = false)::int AS unread_count,
      MAX(ic.commented_at) AS latest_activity
    FROM inbox_comments ic
    LEFT JOIN social_posts sp ON sp.platform_post_id = ic.platform_post_id
    WHERE ic.site_id = ${siteId}
      AND ic.subscriber_id = ${session.subscriberId}
      AND ic.is_hidden = false
    GROUP BY ic.platform_post_id, ic.platform, sp.id, sp.caption, sp.media_urls, sp.platform_post_url
    ORDER BY MAX(ic.commented_at) DESC
    LIMIT 50
  `;

  return <CommentsListClient postGroups={postGroups as PostGroup[]} siteId={siteId} />;
}
