/**
 * POST /api/admin/engage/moderate
 * Body: { eventId, action: 'hide' | 'delete' }
 *
 * Calls the platform's moderation API to hide or delete the comment, then
 * archives the local engagement_event.
 *
 * Supported:
 *   - facebook + comment → hide / delete
 *   - instagram + comment → hide / delete
 *
 * Not supported:
 *   - gbp + review (no API; only Google can remove reviews)
 *   - instagram + mention/tag (it's another user's post, not ours to moderate)
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
  const action = body.action as string | undefined;

  if (!eventId || (action !== "hide" && action !== "delete")) {
    return NextResponse.json({ error: "eventId and action (hide|delete) required" }, { status: 400 });
  }

  const [evt] = await sql`
    SELECT ee.id, ee.platform, ee.event_type, ee.platform_target_id,
           pa.metadata AS asset_metadata,
           sa.access_token_encrypted
    FROM engagement_events ee
    JOIN platform_assets pa ON pa.id = ee.platform_asset_id
    JOIN social_accounts sa ON sa.id = pa.social_account_id
    WHERE ee.id = ${eventId}
  `;

  if (!evt) {
    return NextResponse.json({ error: "Event not found or no platform asset linked" }, { status: 404 });
  }

  const platform = evt.platform as string;
  const eventType = evt.event_type as string;

  // Eligibility check
  if (platform === "gbp") {
    return NextResponse.json({ error: "GBP reviews cannot be hidden or deleted via API. Flag with Google instead." }, { status: 400 });
  }
  if (eventType !== "comment") {
    return NextResponse.json({ error: `Cannot ${action} a ${platform} ${eventType} — only comments support platform moderation.` }, { status: 400 });
  }

  const userToken = decrypt(evt.access_token_encrypted as string);
  const assetMeta = (evt.asset_metadata || {}) as Record<string, unknown>;
  const pageToken = (assetMeta.page_access_token as string) || userToken;
  const commentId = evt.platform_target_id as string;

  try {
    if (action === "hide") {
      const url = `https://graph.facebook.com/v23.0/${commentId}`;
      const params = new URLSearchParams({ is_hidden: "true", access_token: pageToken });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Hide failed (${res.status}): ${errText.slice(0, 300)}`);
      }
    } else {
      // delete
      const url = `https://graph.facebook.com/v23.0/${commentId}?access_token=${encodeURIComponent(pageToken)}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Delete failed (${res.status}): ${errText.slice(0, 300)}`);
      }
    }

    // Archive locally + record what happened in metadata
    await sql`
      UPDATE engagement_events
      SET review_status = 'archived',
          metadata = metadata || ${JSON.stringify({ moderated: { action, at: new Date().toISOString() } })}::jsonb
      WHERE id = ${eventId}
    `;

    return NextResponse.json({ success: true, action });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    );
  }
}
