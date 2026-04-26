/**
 * POST /api/admin/engage/mark-spam
 * Body: { eventId, action: 'mark' | 'unmark' }
 *
 * mark:   sets metadata.is_spam=true + archives + (for IG/FB comments)
 *         hides on platform via Graph API. Spammer never knows.
 * unmark: clears metadata.is_spam, restores review_status='new'.
 *         Does not un-hide on the platform — that's irreversible by us once
 *         hidden, the operator must un-hide via Meta dashboard if desired.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { eventId, action } = await req.json().catch(() => ({}));
  if (!eventId || (action !== "mark" && action !== "unmark")) {
    return NextResponse.json({ error: "eventId and action (mark|unmark) required" }, { status: 400 });
  }

  if (action === "unmark") {
    await sql`
      UPDATE engagement_events
      SET review_status = 'new',
          metadata = metadata - 'is_spam' - 'spam_marked_at'
      WHERE id = ${eventId}
    `;
    return NextResponse.json({ success: true, action: "unmark" });
  }

  // action === 'mark' — load event for platform-hide eligibility
  const [evt] = await sql`
    SELECT ee.id, ee.platform, ee.event_type, ee.platform_target_id,
           pa.metadata AS asset_metadata,
           sa.access_token_encrypted
    FROM engagement_events ee
    LEFT JOIN platform_assets pa ON pa.id = ee.platform_asset_id
    LEFT JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE ee.id = ${eventId}
  `;

  if (!evt) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  let hidOnPlatform = false;
  let hideError: string | null = null;
  const canHide = (evt.platform === "facebook" || evt.platform === "instagram")
    && evt.event_type === "comment"
    && evt.access_token_encrypted;

  if (canHide) {
    const userToken = decrypt(evt.access_token_encrypted as string);
    const assetMeta = (evt.asset_metadata || {}) as Record<string, unknown>;
    const pageToken = (assetMeta.page_access_token as string) || userToken;
    try {
      const params = new URLSearchParams({ is_hidden: "true", access_token: pageToken });
      const res = await fetch(`https://graph.facebook.com/v23.0/${evt.platform_target_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      if (res.ok) {
        hidOnPlatform = true;
      } else {
        hideError = `Hide failed (${res.status})`;
      }
    } catch (err) {
      hideError = err instanceof Error ? err.message : String(err);
    }
  }

  await sql`
    UPDATE engagement_events
    SET review_status = 'archived',
        metadata = metadata || ${JSON.stringify({
          is_spam: true,
          spam_marked_at: new Date().toISOString(),
          spam_hidden_on_platform: hidOnPlatform,
          ...(hideError ? { spam_hide_error: hideError } : {}),
        })}::jsonb
    WHERE id = ${eventId}
  `;

  return NextResponse.json({ success: true, action: "mark", hidOnPlatform, hideError });
}
