import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const siteId = url.searchParams.get("site_id") || session.activeSiteId;
  const platform = url.searchParams.get("platform");

  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });
  if (!platform) return NextResponse.json({ error: "platform required" }, { status: 400 });

  const [account] = await sql`
    SELECT sa.id, sa.account_name, sa.status, sa.token_expires_at,
           (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'published') AS published,
           (SELECT COUNT(*)::int FROM social_posts sp WHERE sp.account_id = sa.id AND sp.status = 'scheduled') AS scheduled
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId}
      AND sa.platform = ${platform}
      AND sa.subscription_id = ${session.subscriptionId}
    ORDER BY sa.created_at DESC
    LIMIT 1
  `;

  if (!account) {
    return NextResponse.json({ connected: false, accountName: null, status: null, tokenExpiresAt: null, published: 0, scheduled: 0 });
  }

  return NextResponse.json({
    connected: true,
    accountName: account.account_name,
    status: account.status,
    tokenExpiresAt: account.token_expires_at ? String(account.token_expires_at) : null,
    published: account.published || 0,
    scheduled: account.scheduled || 0,
  });
}
