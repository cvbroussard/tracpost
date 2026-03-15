import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { createHmac } from "crypto";

/**
 * POST /api/auth/data-deletion
 *
 * Meta Data Deletion Callback. Facebook sends a signed request when a user
 * removes the app from their Facebook Settings → Apps and Websites.
 *
 * We delete all social_accounts matching the Facebook user ID and return
 * a confirmation URL + confirmation code per Meta's spec.
 */
export async function POST(req: NextRequest) {
  const body = await req.formData();
  const signedRequest = body.get("signed_request") as string;

  if (!signedRequest) {
    return NextResponse.json({ error: "Missing signed_request" }, { status: 400 });
  }

  const [encodedSig, payload] = signedRequest.split(".");
  if (!encodedSig || !payload) {
    return NextResponse.json({ error: "Invalid signed_request" }, { status: 400 });
  }

  // Verify signature
  const secret = process.env.META_APP_SECRET!;
  const expectedSig = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  if (encodedSig !== expectedSig) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  // Decode payload
  const data = JSON.parse(Buffer.from(payload, "base64url").toString());
  const fbUserId = data.user_id;

  if (!fbUserId) {
    return NextResponse.json({ error: "No user_id in payload" }, { status: 400 });
  }

  // Delete social accounts matching this Facebook user's IG accounts
  // account_id stores the IG user ID, but we also check metadata for page associations
  const accounts = await sql`
    SELECT id FROM social_accounts
    WHERE metadata::text LIKE ${`%${fbUserId}%`}
       OR account_id = ${fbUserId}
  `;

  for (const account of accounts) {
    await sql`DELETE FROM site_social_links WHERE social_account_id = ${account.id}`;
    await sql`DELETE FROM social_accounts WHERE id = ${account.id}`;
  }

  console.log(`Data deletion callback: FB user ${fbUserId}, deleted ${accounts.length} accounts`);

  // Meta expects a JSON response with a confirmation URL and code
  const confirmationCode = `del_${fbUserId}_${Date.now()}`;
  return NextResponse.json({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/data-deletion`,
    confirmation_code: confirmationCode,
  });
}
