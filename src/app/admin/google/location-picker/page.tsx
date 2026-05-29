import { sql } from "@/lib/db";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin-session";
import { LocationPickerClient } from "./location-picker-client";

export const dynamic = "force-dynamic";

export default async function LocationPickerPage({
  searchParams,
}: {
  searchParams: Promise<{ site_id?: string }>;
}) {
  if (!(await getAdminSession())) redirect("/login");

  const params = await searchParams;
  const siteId = params.site_id;

  const pending = siteId
    ? await sql`
        SELECT sa.id, sa.account_name, sa.metadata
        FROM social_accounts sa
        JOIN business_social_links ssl ON ssl.social_account_id = sa.id
        WHERE ssl.business_id = ${siteId}
          AND sa.platform = 'gbp'
          AND sa.status = 'pending_assignment'
      `
    : await sql`
        SELECT sa.id, sa.account_name, sa.metadata
        FROM social_accounts sa
        WHERE sa.platform = 'gbp'
          AND sa.status = 'pending_assignment'
      `;

  if (pending.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-card text-center">
          <span className="text-2xl">G</span>
          <h2 className="mt-1 text-lg font-medium">No Pending Assignments</h2>
          <p className="mt-2 text-xs text-muted">
            All Google Business connections have been assigned to their sites.
          </p>
        </div>
      </div>
    );
  }

  const sites = await sql`
    SELECT id, name FROM businesses WHERE is_active = true ORDER BY name
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
