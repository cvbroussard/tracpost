import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "@/lib/pipeline/adapters/registry";

/**
 * POST /api/inbox/comments/[id]/reply
 *
 * Reply to a comment. Sends the reply to the platform and stores it.
 * Body: { body: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  const { body: replyText } = await req.json();
  if (!replyText?.trim()) {
    return NextResponse.json({ error: "Reply text required" }, { status: 400 });
  }

  // Load the comment with account credentials
  const [comment] = await sql`
    SELECT ic.*, sa.access_token_encrypted, sa.account_id, sa.metadata AS account_metadata
    FROM inbox_comments ic
    JOIN social_accounts sa ON sa.id = ic.social_account_id
    WHERE ic.id = ${id} AND ic.subscriber_id = ${auth.subscriberId}
  `;

  if (!comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  const adapter = getAdapter(comment.platform);
  if (!adapter?.replyToComment) {
    return NextResponse.json({ error: "Reply not supported for this platform" }, { status: 400 });
  }

  const accessToken = decrypt(comment.access_token_encrypted as string);

  const result = await adapter.replyToComment({
    platformAccountId: comment.account_id,
    accessToken,
    platformCommentId: comment.platform_comment_id,
    body: replyText.trim(),
    accountMetadata: comment.account_metadata as Record<string, unknown>,
  });

  // Store the reply
  await sql`
    UPDATE inbox_comments
    SET our_reply = ${replyText.trim()}, our_reply_at = NOW(), is_read = true
    WHERE id = ${id}
  `;

  return NextResponse.json({ success: result.success, platformReplyId: result.platformReplyId });
}
