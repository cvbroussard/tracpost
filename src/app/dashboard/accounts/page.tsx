import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ConnectionsOverview } from "./connections-overview";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const activeSiteId = session.activeSiteId;

  const accounts = activeSiteId
    ? await sql`
        SELECT sa.platform, sa.account_name, sa.status, sa.token_expires_at
        FROM social_accounts sa
        JOIN site_social_links ssl ON ssl.social_account_id = sa.id
        WHERE ssl.site_id = ${activeSiteId}
          AND sa.subscription_id = ${session.subscriptionId}
        ORDER BY sa.created_at DESC
      `
    : [];

  const connected: Record<string, { accountName: string; status: string; tokenExpiresAt: string | null }> = {};
  for (const acc of accounts) {
    const key = acc.platform as string;
    if (!connected[key]) {
      connected[key] = {
        accountName: acc.account_name as string,
        status: acc.status as string,
        tokenExpiresAt: acc.token_expires_at ? String(acc.token_expires_at) : null,
      };
    }
  }

  return <ConnectionsOverview connected={connected} />;
}
