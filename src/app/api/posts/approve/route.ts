import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const { post_id } = await req.json();
  if (!post_id) {
    return NextResponse.json({ error: "post_id required" }, { status: 400 });
  }

  // Verify ownership via account → site_social_links → site → subscriber
  const [post] = await sql`
    SELECT sp.id
    FROM social_posts sp
    JOIN social_accounts sa ON sa.id = sp.account_id
    JOIN business_social_links ssl ON ssl.social_account_id = sa.id
    JOIN businesses s ON s.id = ssl.business_id
    WHERE sp.id = ${post_id} AND s.billing_account_id = ${auth.subscriptionId}
  `;

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  await sql`
    UPDATE social_posts
    SET status = 'scheduled', scheduled_at = COALESCE(scheduled_at, NOW())
    WHERE id = ${post_id}
  `;

  return NextResponse.json({ success: true });
}
