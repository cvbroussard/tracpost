import { sql } from "@/lib/db";
import { ManageShell } from "@/components/manage/manage-shell";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "TracPost — Manage",
};

export default async function ManageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const subscribers = await sql`
    SELECT sub.id, u.name AS subscriber_name, sub.plan, sub.is_active,
           (SELECT COUNT(*)::int FROM businesses WHERE billing_account_id = sub.id AND is_active = true) AS site_count
    FROM accounts sub
    JOIN users u ON u.billing_account_id = sub.id AND u.role = 'owner'
    WHERE sub.is_active = true
    ORDER BY u.name ASC
  `;

  const sites = await sql`
    SELECT s.id, s.name, s.billing_account_id, bs.custom_domain
    FROM businesses s
    LEFT JOIN blog_settings bs ON bs.business_id = s.id
    WHERE s.is_active = true
    ORDER BY s.name ASC
  `;

  return (
    <ManageShell
      subscribers={subscribers.map(s => ({
        id: s.id as string,
        name: s.subscriber_name as string,
        plan: s.plan as string,
        siteCount: s.site_count as number,
      }))}
      sites={sites.map(s => ({
        id: s.id as string,
        name: s.name as string,
        subscriptionId: s.billing_account_id as string,
        customDomain: (s.custom_domain as string) || null,
      }))}
    >
      {children}
    </ManageShell>
  );
}
