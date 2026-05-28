import { sql } from "@/lib/db";
import { SitePickerClient } from "./site-picker-client";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const sites = await sql`
    SELECT s.id, s.name, s.provisioning_status, s.autopilot_enabled,
           u.name AS subscriber_name, sub.plan,
           (SELECT COUNT(*)::int FROM media_assets WHERE business_id = s.id) AS asset_count,
           (SELECT COUNT(*)::int FROM blog_posts WHERE business_id = s.id AND status = 'published') AS published_posts
    FROM businesses s
    JOIN accounts sub ON sub.id = s.billing_account_id
    JOIN users u ON u.id = sub.owner_user_id
    WHERE s.is_active = true
    ORDER BY s.name ASC
  `;

  return (
    <SitePickerClient
      sites={sites.map((s) => ({
        id: s.id as string,
        name: s.name as string,
        subscriberName: s.subscriber_name as string,
        plan: s.plan as string,
        assetCount: (s.asset_count as number) || 0,
        publishedPosts: (s.published_posts as number) || 0,
        provisioningStatus: s.provisioning_status as string,
        autopilotEnabled: s.autopilot_enabled as boolean,
      }))}
    />
  );
}
