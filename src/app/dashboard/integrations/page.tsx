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
  const siteCountRows = await sql`SELECT COUNT(*)::int AS n FROM businesses WHERE billing_account_id = ${session.subscriptionId}`;
  const hasNoSites = (siteCountRows[0]?.n as number) === 0;

  const isEnterprise = session.plan.toLowerCase().includes("enterprise");

  if (!activeSiteId) {
    return <ConnectionsOverview statuses={statuses} hasNoSites={hasNoSites} isEnterprise={isEnterprise} />;
  }

  // 1. Assigned platform_assets (new model)
  const assigned = await sql`
    SELECT pa.platform, pa.asset_name, sa.token_expires_at
    FROM business_platform_assets spa
    JOIN platform_assets pa ON pa.id = spa.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE spa.business_id = ${activeSiteId}
      AND spa.is_primary = true
      AND sa.billing_account_id = ${session.subscriptionId}
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
    JOIN business_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.business_id = ${activeSiteId}
      AND sa.billing_account_id = ${session.subscriptionId}
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

  // 3. Pending assignment: subscriber has assets but THIS site has none
  // assigned. Mirror the platform-status API filter — exclude assets bound
  // to other sites in the subscription so the tile doesn't show
  // pending_assignment when the only available asset is already taken
  // by a sibling site (e.g., EK's IG when viewing B²'s integrations).
  const available = await sql`
    SELECT pa.platform, COUNT(*)::int AS count
    FROM platform_assets pa
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE sa.billing_account_id = ${session.subscriptionId}
      AND NOT EXISTS (
        SELECT 1 FROM business_platform_assets spa_other
        WHERE spa_other.platform_asset_id = pa.id
          AND spa_other.business_id != ${activeSiteId}
      )
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

  return <ConnectionsOverview statuses={statuses} hasNoSites={hasNoSites} isEnterprise={isEnterprise} />;
}
