import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = new URL(req.url).searchParams.get("site_id") || session.activeSiteId;
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  const accounts = await sql`
    SELECT sa.platform, sa.account_name, sa.status, sa.token_expires_at
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId}
      AND sa.subscription_id = ${session.subscriptionId}
    ORDER BY sa.created_at DESC
  `;

  const byPlatform: Record<string, { accountName: string; status: string; tokenExpiresAt: string | null }> = {};
  for (const acc of accounts) {
    const key = acc.platform as string;
    if (!byPlatform[key]) {
      byPlatform[key] = {
        accountName: acc.account_name as string,
        status: acc.status as string,
        tokenExpiresAt: acc.token_expires_at ? String(acc.token_expires_at) : null,
      };
    }
  }

  return NextResponse.json(byPlatform);
}
