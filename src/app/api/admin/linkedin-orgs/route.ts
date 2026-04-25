import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [row] = await sql`
    SELECT access_token_encrypted, metadata FROM social_accounts
    WHERE platform = 'linkedin' ORDER BY updated_at DESC LIMIT 1
  `;

  if (!row) return NextResponse.json({ error: "No LinkedIn account found" });

  const accessToken = decrypt(row.access_token_encrypted as string);

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "LinkedIn-Version": "202401",
  };

  // Try the v2 organizationAcls endpoint
  const aclRes = await fetch(
    "https://api.linkedin.com/v2/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organization~(id,localizedName,vanityName)))",
    { headers }
  );

  const aclStatus = aclRes.status;
  const aclBody = await aclRes.text();

  // Also try the REST API version
  const restRes = await fetch(
    "https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR",
    {
      headers: {
        ...headers,
        "X-Restli-Protocol-Version": "2.0.0",
      }
    }
  );

  const restStatus = restRes.status;
  const restBody = await restRes.text();

  return NextResponse.json({
    v2: { status: aclStatus, body: aclBody },
    rest: { status: restStatus, body: restBody },
  });
}
