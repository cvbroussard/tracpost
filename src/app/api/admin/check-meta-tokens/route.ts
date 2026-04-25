import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accts = await sql`
    SELECT id, platform, account_name, account_id, access_token_encrypted, status
    FROM social_accounts
    WHERE platform IN ('facebook','instagram')
    ORDER BY platform, account_name
  `;

  const appId = process.env.META_APP_ID || process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.META_APP_SECRET || process.env.FACEBOOK_APP_SECRET;
  const appToken = appId && appSecret ? `${appId}|${appSecret}` : null;

  const results = [];
  for (const a of accts) {
    try {
      const token = decrypt(a.access_token_encrypted as string);

      // Authoritative check via debug_token
      let debugInfo: Record<string, unknown> = {};
      if (appToken) {
        const dbgRes = await fetch(
          `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`
        );
        const dbgData = await dbgRes.json();
        debugInfo = dbgData.data || dbgData;
      }

      // Also do a live API fetch as a sanity check
      const url = a.platform === "facebook"
        ? `https://graph.facebook.com/v23.0/${a.account_id}?fields=id,name&access_token=${token}`
        : `https://graph.facebook.com/v23.0/${a.account_id}?fields=id,username&access_token=${token}`;
      const res = await fetch(url);
      const data = await res.json();

      results.push({
        id: a.id,
        platform: a.platform,
        account_name: a.account_name,
        db_status: a.status,
        debug_token: {
          is_valid: debugInfo.is_valid,
          expires_at: debugInfo.expires_at,
          scopes: debugInfo.scopes,
          granular_scopes: debugInfo.granular_scopes,
          error: debugInfo.error,
        },
        live_fetch: {
          ok: res.ok && !data.error,
          response: data.error?.message || data.name || data.username || "OK",
        },
      });
    } catch (err) {
      results.push({
        id: a.id,
        platform: a.platform,
        account_name: a.account_name,
        db_status: a.status,
        error: err instanceof Error ? err.message : "Decrypt failed",
      });
    }
  }

  return NextResponse.json({ accounts: results });
}
