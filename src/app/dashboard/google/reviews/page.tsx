import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ReviewsListClient } from "@/app/dashboard/inbox/reviews/reviews-list-client";

export const dynamic = "force-dynamic";

export default async function GoogleReviewsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  const reviews = await sql`
    SELECT *
    FROM inbox_reviews
    WHERE site_id = ${siteId}
      AND subscription_id = ${session.subscriptionId}
      AND is_hidden = false
    ORDER BY reviewed_at DESC
    LIMIT 50
  `;

  const [counts] = await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE reply_status = 'needs_reply')::int AS needs_reply,
      COUNT(*) FILTER (WHERE reply_status = 'draft_ready')::int AS draft_ready,
      COUNT(*) FILTER (WHERE reply_status = 'replied')::int AS replied
    FROM inbox_reviews
    WHERE site_id = ${siteId}
      AND subscription_id = ${session.subscriptionId}
      AND is_hidden = false
  `;

  const countsData = {
    total: (counts?.total as number) ?? 0,
    needs_reply: (counts?.needs_reply as number) ?? 0,
    draft_ready: (counts?.draft_ready as number) ?? 0,
    replied: (counts?.replied as number) ?? 0,
  };

  return (
    <ReviewsListClient
      siteId={siteId}
      initialReviews={reviews}
      initialCounts={countsData}
    />
  );
}
