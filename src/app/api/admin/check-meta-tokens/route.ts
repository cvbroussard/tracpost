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

  const results = [];
  for (const a of accts) {
    try {
      const token = decrypt(a.access_token_encrypted as string);
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
        api_valid: res.ok && !data.error,
        api_response: data.error?.message || data.name || data.username || "OK",
      });
    } catch (err) {
      results.push({
        id: a.id,
        platform: a.platform,
        account_name: a.account_name,
        db_status: a.status,
        api_valid: false,
        api_response: err instanceof Error ? err.message : "Decrypt failed",
      });
    }
  }

  return NextResponse.json({ accounts: results });
}
