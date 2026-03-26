import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ConnectButton } from "./connect-modal";
import { OnboardingTip } from "@/components/onboarding-tip";
import { AccountList } from "./account-list";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const subscriberId = session.subscriberId;
  const activeSiteId = session.activeSiteId;

  // Social accounts linked to the active site
  const accounts = activeSiteId
    ? await sql`
        SELECT sa.id, sa.platform, sa.account_name, sa.status, sa.token_expires_at,
               sa.created_at, sa.metadata,
               (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'published') AS published,
               (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'scheduled') AS scheduled
        FROM social_accounts sa
        JOIN site_social_links ssl ON ssl.social_account_id = sa.id
        WHERE ssl.site_id = ${activeSiteId} AND sa.subscriber_id = ${subscriberId}
        ORDER BY sa.created_at DESC
      `
    : [];

  const accountData = accounts.map((acc) => ({
    id: acc.id as string,
    platform: acc.platform as string,
    account_name: acc.account_name as string,
    status: acc.status as string,
    token_expires_at: acc.token_expires_at ? String(acc.token_expires_at) : null,
    published: (acc.published as number) || 0,
    scheduled: (acc.scheduled as number) || 0,
    metadata: (acc.metadata as Record<string, unknown>) || null,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <OnboardingTip
        tipKey="accounts"
        message="Every platform is a discovery channel. A client might find you on TikTok but book through Instagram. Connecting all 8 maximizes your reach and gives the autopilot the widest publishing surface."
        incomplete={accounts.length < 8}
      />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-lg font-semibold">Social Accounts</h1>
          <p className="text-sm text-muted">{accounts.length} connected</p>
        </div>
        <ConnectButton siteId={session.activeSiteId} />
      </div>

      <AccountList accounts={accountData} />
    </div>
  );
}
