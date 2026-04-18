import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { GoogleOverviewClient } from "./google-overview-client";

export const dynamic = "force-dynamic";

export default async function GoogleHubPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  const [reviewStats] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE reply_status = 'needs_reply')::int AS needs_reply,
      COUNT(*) FILTER (WHERE reply_status = 'draft_ready')::int AS draft_ready,
      COUNT(*) FILTER (WHERE reply_status = 'replied')::int AS replied,
      ROUND(AVG(rating)::numeric, 1)::float AS avg_rating,
      COUNT(*) FILTER (WHERE reviewed_at > NOW() - INTERVAL '30 days')::int AS recent
    FROM inbox_reviews
    WHERE site_id = ${siteId}
      AND subscription_id = ${session.subscriptionId}
      AND is_hidden = false
  `;

  const [gbpAccount] = await sql`
    SELECT sa.account_name, sa.status, sa.metadata
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp'
    LIMIT 1
  `;

  const [postStats] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE sp.status = 'published')::int AS published,
      COUNT(*) FILTER (WHERE sp.published_at > NOW() - INTERVAL '30 days')::int AS recent
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.platform = 'gbp'
  `;

  return (
    <GoogleOverviewClient
      connected={!!gbpAccount}
      accountName={gbpAccount?.account_name || null}
      accountStatus={gbpAccount?.status || null}
      reviews={{
        total: reviewStats?.total ?? 0,
        needsReply: reviewStats?.needs_reply ?? 0,
        draftReady: reviewStats?.draft_ready ?? 0,
        replied: reviewStats?.replied ?? 0,
        avgRating: reviewStats?.avg_rating ?? 0,
        recent: reviewStats?.recent ?? 0,
      }}
      posts={{
        total: postStats?.total ?? 0,
        published: postStats?.published ?? 0,
        recent: postStats?.recent ?? 0,
      }}
    />
  );
}
