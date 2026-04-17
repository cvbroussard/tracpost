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

  const [post] = await sql`
    SELECT sp.id, sp.status
    FROM social_posts sp
    JOIN social_accounts sa ON sa.id = sp.account_id
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    JOIN sites s ON s.id = ssl.site_id
    WHERE sp.id = ${post_id} AND s.subscription_id = ${auth.subscriptionId}
  `;

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.status !== "failed") {
    return NextResponse.json({ error: "Only failed posts can be retried" }, { status: 400 });
  }

  await sql`
    UPDATE social_posts
    SET status = 'scheduled',
        error_message = NULL,
        scheduled_at = NOW()
    WHERE id = ${post_id}
  `;

  await sql`
    INSERT INTO social_post_history (post_id, action, old_status, new_status, notes)
    VALUES (${post_id}, 'retry', 'failed', 'scheduled', 'Retried by tenant from Unipost')
  `;

  return NextResponse.json({ success: true });
}
