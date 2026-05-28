import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * GET /api/social-accounts?site_id=xxx
 *
 * List social accounts linked to a site for the authenticated subscriber.
 */
export async function GET(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const siteId = new URL(req.url).searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const accounts = await sql`
    SELECT sa.id, sa.platform, sa.account_name, sa.status, sa.token_expires_at
    FROM social_accounts sa
    JOIN business_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.business_id = ${siteId} AND sa.billing_account_id = ${auth.subscriptionId}
    ORDER BY sa.platform ASC
  `;

  return NextResponse.json({ accounts });
}
