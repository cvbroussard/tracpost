import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { getAdapter } from "@/lib/pipeline/adapters/registry";

/**
 * POST /api/inbox/reviews/[id]/reply
 *
 * Reply to a review. Sends the reply to the platform and stores it.
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

  // Load the review with account credentials
  const [review] = await sql`
    SELECT ir.*, sa.access_token_encrypted, sa.account_id, sa.metadata AS account_metadata
    FROM inbox_reviews ir
    JOIN social_accounts sa ON sa.id = ir.social_account_id
    WHERE ir.id = ${id} AND ir.subscriber_id = ${auth.subscriberId}
  `;

  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  const adapter = getAdapter(review.platform);
  if (!adapter?.replyToReview) {
    return NextResponse.json({ error: "Reply not supported for this platform" }, { status: 400 });
  }

  const accessToken = decrypt(review.access_token_encrypted as string);

  const result = await adapter.replyToReview({
    platformAccountId: review.account_id,
    accessToken,
    platformReviewId: review.platform_review_id,
    body: replyText.trim(),
    accountMetadata: review.account_metadata as Record<string, unknown>,
  });

  // Store the reply
  await sql`
    UPDATE inbox_reviews
    SET our_reply = ${replyText.trim()}, our_reply_at = NOW(), is_read = true
    WHERE id = ${id}
  `;

  return NextResponse.json({ success: result.success });
}
