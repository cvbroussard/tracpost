import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { generateSuggestedReply } from "@/lib/inbox/ai-response";

/**
 * POST /api/inbox/reviews/[id]/suggest
 *
 * Generate an AI-suggested response for a review.
 * Returns cached suggestion if already generated.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;
  const { id } = await params;

  // Load the review
  const [review] = await sql`
    SELECT ir.*, s.name AS site_name, s.brand_voice, s.brand_playbook
    FROM inbox_reviews ir
    JOIN sites s ON s.id = ir.site_id
    WHERE ir.id = ${id} AND ir.subscriber_id = ${auth.subscriberId}
  `;

  if (!review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }

  // Return cached suggestion if available
  if (review.suggested_reply) {
    return NextResponse.json({ suggestion: review.suggested_reply });
  }

  // Generate suggestion
  const suggestion = await generateSuggestedReply({
    reviewBody: review.body,
    rating: review.rating,
    reviewerName: review.reviewer_name,
    siteName: review.site_name,
    brandVoice: review.brand_voice,
    brandPlaybook: review.brand_playbook,
  });

  // Cache it
  await sql`
    UPDATE inbox_reviews
    SET suggested_reply = ${suggestion}, suggested_reply_at = NOW()
    WHERE id = ${id}
  `;

  return NextResponse.json({ suggestion });
}
