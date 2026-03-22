import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ReviewsListClient } from "./reviews-list-client";

export const dynamic = "force-dynamic";

export default async function ReviewsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  const reviews = await sql`
    SELECT *
    FROM inbox_reviews
    WHERE site_id = ${siteId}
      AND subscriber_id = ${session.subscriberId}
      AND is_hidden = false
    ORDER BY reviewed_at DESC
    LIMIT 50
  `;

  return <ReviewsListClient reviews={reviews} />;
}
