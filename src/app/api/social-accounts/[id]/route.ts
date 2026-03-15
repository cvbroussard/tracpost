import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

/**
 * DELETE /api/social-accounts/[id]
 *
 * Disconnect a social account. Removes the account and all its site links.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const { id } = await params;

  // Verify ownership and get token for revocation
  const [account] = await sql`
    SELECT id, account_id, access_token_encrypted FROM social_accounts
    WHERE id = ${id} AND subscriber_id = ${auth.subscriberId}
  `;
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Revoke token on Meta's side (best-effort — don't block disconnect on failure)
  if (account.access_token_encrypted) {
    try {
      const revokeRes = await fetch(
        `https://graph.facebook.com/v21.0/${account.account_id}/permissions?access_token=${account.access_token_encrypted}`,
        { method: "DELETE" }
      );
      const revokeData = await revokeRes.json();
      console.log("Token revocation:", revokeRes.status, JSON.stringify(revokeData));
    } catch (err) {
      console.error("Token revocation failed (non-blocking):", err);
    }
  }

  // Remove site links first
  await sql`DELETE FROM site_social_links WHERE social_account_id = ${id}`;

  // Remove the account
  await sql`DELETE FROM social_accounts WHERE id = ${id}`;

  return NextResponse.json({ ok: true });
}
