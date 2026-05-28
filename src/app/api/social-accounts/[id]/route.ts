import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

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
    WHERE id = ${id} AND billing_account_id = ${auth.subscriptionId}
  `;
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  // Revoke token on Meta's side (best-effort — don't block disconnect on failure).
  // Without this, Meta may silently reuse the existing OAuth grant on next
  // Connect, skipping the asset picker — which defeats the fresh-start intent.
  if (account.access_token_encrypted) {
    try {
      const revokeRes = await fetch(
        `https://graph.facebook.com/v21.0/${account.account_id}/permissions?access_token=${decrypt(account.access_token_encrypted as string)}`,
        { method: "DELETE" }
      );
      const revokeData = await revokeRes.json();
      console.log("Token revocation:", revokeRes.status, JSON.stringify(revokeData));
    } catch (err) {
      console.error("Token revocation failed (non-blocking):", err);
    }
  }

  // Cascade: cancel scheduled posts that depend on this connection.
  // Per the connection lifecycle policy: drafts and published posts stay,
  // only scheduled (locked-in publish time, queued for cron pickup) get cancelled.
  // Subscriber pre-acknowledged via the confirm dialog.
  const cascadeResult = await sql`
    UPDATE social_posts
    SET status = 'cancelled',
        updated_at = NOW()
    WHERE account_id = ${id}
      AND status = 'scheduled'
    RETURNING id
  `;
  const cancelledScheduledCount = cascadeResult.length;

  // Remove site links (legacy site_social_links + new site_platform_assets via cascade)
  await sql`DELETE FROM business_social_links WHERE social_account_id = ${id}`;

  // platform_assets row(s) for this social_account; site_platform_assets cascades on FK
  await sql`DELETE FROM platform_assets WHERE social_account_id = ${id}`;

  // Remove the account row last (FK references resolved above)
  await sql`DELETE FROM social_accounts WHERE id = ${id}`;

  return NextResponse.json({ ok: true, cancelledScheduledCount });
}
