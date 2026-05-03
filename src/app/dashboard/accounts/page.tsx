import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ConnectionsOverview } from "./connections-overview";

export const dynamic = "force-dynamic";

interface PlatformStatus {
  status: "connected" | "pending_assignment" | "not_connected";
  accountName: string | null;
  tokenExpiresAt: string | null;
  availableAssets?: number;
}

export default async function AccountsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const activeSiteId = session.activeSiteId;
  const statuses: Record<string, PlatformStatus> = {};

  // A subscription with zero sites has nowhere to publish — gate the
  // entire connections UI behind site creation.
  const siteCountRows = await sql`SELECT COUNT(*)::int AS n FROM sites WHERE subscription_id = ${session.subscriptionId}`;
  const hasNoSites = (siteCountRows[0]?.n as number) === 0;

  if (!activeSiteId) {
    return <ConnectionsOverview statuses={statuses} hasNoSites={hasNoSites} />;
  }

  // 1. Assigned platform_assets (new model)
  const assigned = await sql`
    SELECT pa.platform, pa.asset_name, sa.token_expires_at
    FROM site_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.site_id = ${activeSiteId}
      AND spa.is_primary = true
      AND sa.subscription_id = ${session.subscriptionId}
  `;
  for (const row of assigned) {
    statuses[row.platform as string] = {
      status: "connected",
      accountName: row.asset_name as string,
      tokenExpiresAt: row.token_expires_at ? String(row.token_expires_at) : null,
    };
  }

  // 2. Legacy site_social_links (only if not already set)
  const legacy = await sql`
    SELECT sa.platform, sa.account_name, sa.token_expires_at
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${activeSiteId}
      AND sa.subscription_id = ${session.subscriptionId}
    ORDER BY sa.created_at DESC
  `;
  for (const row of legacy) {
    const key = row.platform as string;
    if (!statuses[key]) {
      statuses[key] = {
        status: "connected",
        accountName: row.account_name as string,
        tokenExpiresAt: row.token_expires_at ? String(row.token_expires_at) : null,
      };
    }
  }

  // 3. Pending assignment: subscriber has assets but this site has none assigned
  const available = await sql`
    SELECT pa.platform, COUNT(*)::int AS count
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE sa.subscription_id = ${session.subscriptionId}
    GROUP BY pa.platform
  `;
  for (const row of available) {
    const key = row.platform as string;
    if (!statuses[key]) {
      statuses[key] = {
        status: "pending_assignment",
        accountName: null,
        tokenExpiresAt: null,
        availableAssets: row.count as number,
      };
    }
  }

  return <ConnectionsOverview statuses={statuses} hasNoSites={hasNoSites} />;
}
