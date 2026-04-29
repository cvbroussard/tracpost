/**
 * POST /api/admin/engage/reply
 * Body: { eventId, body }
 * Posts a reply back to the originating platform (GBP review, IG comment, FB comment).
 * On success, marks the source event as 'reviewed'.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import { decrypt } from "@/lib/crypto";

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const eventId = body.eventId as string | undefined;
  const replyText = (body.body as string | undefined)?.trim();

  if (!eventId || !replyText) {
    return NextResponse.json({ error: "eventId and body required" }, { status: 400 });
  }

  // Pull event + parent token + asset metadata
  const [evt] = await sql`
    SELECT ee.id, ee.platform, ee.event_type, ee.platform_target_id, ee.metadata,
           pa.metadata AS asset_metadata, pa.asset_id AS platform_native_id,
           sa.access_token_encrypted
    FROM engagement_events ee
    JOIN platform_assets pa ON pa.id = ee.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE ee.id = ${eventId}
  `;

  if (!evt) {
    return NextResponse.json({ error: "Event not found or no platform asset linked" }, { status: 404 });
  }

  const userToken = decrypt(evt.access_token_encrypted as string);
  const assetMeta = (evt.asset_metadata || {}) as Record<string, unknown>;
  const eventMeta = (evt.metadata || {}) as Record<string, unknown>;

  try {
    if (evt.platform === "gbp") {
      // GBP review reply — PUT /v4/{accountId}/locations/{locationId}/reviews/{reviewId}/reply
      const accountId = (assetMeta.accountId as string) || (assetMeta.account_id as string) || "";
      const locationPart = (evt.platform_native_id as string).startsWith("locations/")
        ? evt.platform_native_id
        : `locations/${evt.platform_native_id}`;
      const reviewName = (eventMeta.raw as Record<string, unknown>)?.name as string | undefined;

      // Use review.name if we captured it; otherwise reconstruct from accountId + location + reviewId
      const path = reviewName
        ? reviewName
        : `${accountId}/${locationPart}/reviews/${evt.platform_target_id}`;

      const url = `https://mybusiness.googleapis.com/v4/${path}/reply`;
      const res = await fetch(url, {
        method: "PUT",
        headers: { Authorization: `Bearer ${userToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ comment: replyText }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`GBP reply failed (${res.status}): ${errText.slice(0, 300)}`);
      }
    } else if (evt.platform === "instagram" || evt.platform === "facebook") {
      // IG/FB comment reply — POST /v23.0/{comment_id}/[replies|comments]
      const pageToken = (assetMeta.page_access_token as string) || userToken;
      const endpoint = evt.platform === "instagram" ? "replies" : "comments";
      const url = `https://graph.facebook.com/v23.0/${evt.platform_target_id}/${endpoint}`;
      const params = new URLSearchParams({ message: replyText, access_token: pageToken });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${evt.platform} reply failed (${res.status}): ${errText.slice(0, 300)}`);
      }
    } else {
      return NextResponse.json({ error: `Reply not supported for platform: ${evt.platform}` }, { status: 400 });
    }

    // Mark the source event as reviewed
    await sql`UPDATE engagement_events SET review_status = 'reviewed' WHERE id = ${eventId}`;

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
