/**
 * GET /api/admin/debug-meta-token?social_account_id=xxx
 *
 * Returns the raw debug_token response from Meta for the given token,
 * untransformed. Use this to see exactly what Meta says about a token.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const socialAccountId = new URL(req.url).searchParams.get("social_account_id");
  if (!socialAccountId) {
    return NextResponse.json({ error: "social_account_id required" }, { status: 400 });
  }

  const [acct] = await sql`
    SELECT id, platform, account_name, account_id, access_token_encrypted
    FROM social_accounts
    WHERE id = ${socialAccountId}
  `;
  if (!acct) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const token = decrypt(acct.access_token_encrypted as string);
  const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
  const appToken = `${appId}|${appSecret}`;

  // Raw debug_token call to Meta
  const debugUrl = `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`;
  const debugRes = await fetch(debugUrl);
  const debugData = await debugRes.json();

  return NextResponse.json({
    our_db: {
      id: acct.id,
      platform: acct.platform,
      account_name: acct.account_name,
      account_id: acct.account_id,
    },
    meta_debug_token_raw: debugData, // exactly what Meta returned, untransformed
  });
}
