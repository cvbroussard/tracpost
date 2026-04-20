import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { LocationPickerClient } from "./location-picker-client";

export const dynamic = "force-dynamic";

/**
 * Admin-only location picker for GBP connections.
 * Shows pending GBP connections and lets the operator assign
 * the correct location to the correct site.
 */
export default async function LocationPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ site_id?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const siteId = params.site_id;

  // Get pending GBP connections for this site or all sites
  const pending = siteId
    ? await sql`
        SELECT sa.id, sa.account_name, sa.metadata
        FROM social_accounts sa
        JOIN site_social_links ssl ON ssl.social_account_id = sa.id
        WHERE ssl.site_id = ${siteId}
          AND sa.platform = 'gbp'
          AND sa.status = 'pending_assignment'
      `
    : await sql`
        SELECT sa.id, sa.account_name, sa.metadata
        FROM social_accounts sa
        WHERE sa.platform = 'gbp'
          AND sa.status = 'pending_assignment'
          AND sa.subscription_id = ${session.subscriptionId}
      `;

  if (pending.length === 0) {
    redirect(siteId ? `/admin/sites/${siteId}` : "/dashboard/accounts");
  }

  // Get all sites for the dropdown
  const sites = await sql`
    SELECT id, name FROM sites
    WHERE subscription_id = ${session.subscriptionId} AND is_active = true
    ORDER BY name
  `;

  const pendingConnections = pending.map((p) => {
    const meta = p.metadata as Record<string, unknown>;
    return {
      socialAccountId: p.id as string,
      email: p.account_name as string,
      initiatingSiteId: (meta.initiating_site_id as string) || null,
      initiatingSiteName: (meta.initiating_site_name as string) || null,
      locations: (meta.discovered_locations || []) as Array<{
        accountId: string;
        locationId: string;
        locationName: string;
        address: string;
      }>,
    };
  });

  return (
    <LocationPickerClient
      pendingConnections={pendingConnections}
      sites={sites.map((s) => ({ id: s.id as string, name: s.name as string }))}
    />
  );
}
