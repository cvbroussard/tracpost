import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { decrypt } from "@/lib/crypto";
import { setEntityStatus } from "@/lib/meta-ads";

/**
 * POST /api/dashboard/campaigns/set-status
 *
 * Body: { entityId, status }   where status ∈ 'ACTIVE' | 'PAUSED'
 *
 * Pauses or activates a Marketing API entity (campaign, ad set, or ad).
 * Meta uses the same POST /{entity_id} pattern for all three. The
 * subscriber may flip status from TracPost without leaving for Meta
 * Ads Manager — the "easy reversibility" half of the informed-consent
 * model that justifies Quick Boost defaulting to ACTIVE.
 *
 * Token is the Ads OAuth grant on the active site.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!session.activeSiteId) return NextResponse.json({ error: "No active site" }, { status: 400 });
  if (!session.plan.toLowerCase().includes("enterprise")) {
    return NextResponse.json({ error: "Enterprise tier required" }, { status: 403 });
  }

  const body = await req.json();
  const entityId = String(body.entityId || "").trim();
  const status = String(body.status || "").trim().toUpperCase();

  if (!entityId) {
    return NextResponse.json({ error: "entityId required" }, { status: 400 });
  }
  if (status !== "ACTIVE" && status !== "PAUSED") {
    return NextResponse.json({ error: "status must be ACTIVE or PAUSED" }, { status: 400 });
  }

  // Find an Ads OAuth token for this subscription. We don't restrict to
  // the primary ad account — any meta_ads token from the subscription's
  // grants can perform this update against any of the subscriber's ad
  // accounts.
  const [grant] = await sql`
    SELECT access_token_encrypted
    FROM social_accounts
    WHERE subscription_id = ${session.subscriptionId}
      AND platform = 'meta_ads'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  if (!grant) {
    return NextResponse.json({ error: "No Meta Ads OAuth grant found" }, { status: 400 });
  }

  const accessToken = decrypt(grant.access_token_encrypted as string);

  try {
    await setEntityStatus(entityId, status as "ACTIVE" | "PAUSED", accessToken);
    return NextResponse.json({ success: true, entityId, status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "marketing_api_failed", message }, { status: 502 });
  }
}
