import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * POST /api/social-accounts/select-org
 * Body: { accountId, orgId, orgName }
 *
 * Select a LinkedIn organization (Company Page) for publishing.
 * Updates the social_account metadata with the selected org.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { accountId, orgId, orgName } = body;

  if (!accountId || !orgId) {
    return NextResponse.json({ error: "accountId and orgId required" }, { status: 400 });
  }

  // Verify ownership
  const [account] = await sql`
    SELECT id, metadata FROM social_accounts
    WHERE id = ${accountId} AND billing_account_id = ${session.subscriptionId} AND platform = 'linkedin'
  `;

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const currentMeta = (account.metadata || {}) as Record<string, unknown>;
  const updatedMeta = {
    ...currentMeta,
    selected_org: {
      org_id: orgId,
      org_name: orgName,
      org_urn: `urn:li:organization:${orgId}`,
    },
  };

  await sql`
    UPDATE social_accounts
    SET account_name = ${orgName},
        account_id = ${orgId},
        metadata = ${JSON.stringify(updatedMeta)}::jsonb,
        updated_at = NOW()
    WHERE id = ${accountId}
  `;

  return NextResponse.json({ ok: true });
}
