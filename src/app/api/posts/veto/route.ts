import { sql } from "@/lib/db";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/posts/veto — Subscriber's one lever over the pipeline.
 *
 * Pulls back a scheduled post. The publishing slot is marked "vetoed".
 * The pipeline will attempt to fill the slot with the next best asset
 * on next run. The source asset's processing stage is unchanged —
 * utilization is no longer a processing_stage.
 *
 * Body: { post_id, reason? }
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  try {
    const body = await req.json();
    const { post_id, reason } = body;

    if (!post_id) {
      return NextResponse.json(
        { error: "post_id is required" },
        { status: 400 }
      );
    }

    // Fetch the post, verify ownership through the chain:
    // post → account → site → subscriber
    const [post] = await sql`
      SELECT sp.id, sp.status, sp.slot_id, sp.source_asset_id,
             sa.business_id, s.billing_account_id
      FROM social_posts sp
      JOIN social_accounts sa ON sp.account_id = sa.id
      JOIN businesses s ON sa.business_id = s.id
      WHERE sp.id = ${post_id}
    `;

    if (!post || post.subscription_id !== auth.subscriptionId) {
      return NextResponse.json(
        { error: "Post not found" },
        { status: 404 }
      );
    }

    if (post.status !== "scheduled") {
      return NextResponse.json(
        { error: `Cannot veto a post with status "${post.status}"` },
        { status: 400 }
      );
    }

    // Veto the post
    await sql`
      UPDATE social_posts
      SET status = 'vetoed', vetoed_at = NOW(), veto_reason = ${reason || null}
      WHERE id = ${post_id}
    `;

    // Record the veto reason on the asset for audit. Processing stage
    // (processing_stage) is unchanged — utilization is no longer a status.
    if (post.source_asset_id) {
      await sql`
        UPDATE media_assets
        SET shelve_reason = 'Vetoed by subscriber'
        WHERE id = ${post.source_asset_id}
      `;
    }

    // Mark slot as vetoed (pipeline will create a replacement slot on next run)
    if (post.slot_id) {
      await sql`
        UPDATE publishing_slots
        SET status = 'vetoed'
        WHERE id = ${post.slot_id}
      `;
    }

    // Audit trail
    await sql`
      INSERT INTO social_post_history (post_id, action, old_status, new_status, notes)
      VALUES (${post_id}, 'veto', 'scheduled', 'vetoed', ${reason || 'Subscriber veto'})
    `;

    await sql`
      INSERT INTO subscriber_actions (business_id, action_type, target_type, target_id, payload)
      VALUES (${post.site_id}, 'veto', 'social_post', ${post_id}, ${JSON.stringify({ reason })})
    `;

    return NextResponse.json({
      vetoed: true,
      post_id,
      message: "Post vetoed. Slot will be refilled on next pipeline run.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
