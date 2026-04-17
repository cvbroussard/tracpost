import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const { post_id, caption } = await req.json();
  if (!post_id || typeof caption !== "string") {
    return NextResponse.json({ error: "post_id and caption required" }, { status: 400 });
  }

  const [post] = await sql`
    SELECT sp.id
    FROM social_posts sp
    JOIN social_accounts sa ON sa.id = sp.account_id
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    JOIN sites s ON s.id = ssl.site_id
    WHERE sp.id = ${post_id} AND s.subscription_id = ${auth.subscriptionId}
      AND sp.status IN ('draft', 'failed', 'scheduled')
  `;

  if (!post) {
    return NextResponse.json({ error: "Post not found or already published" }, { status: 404 });
  }

  await sql`
    UPDATE social_posts SET caption = ${caption.trim()} WHERE id = ${post_id}
  `;

  return NextResponse.json({ success: true });
}
