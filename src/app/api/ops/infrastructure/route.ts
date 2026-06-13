/**
 * GET /api/ops/infrastructure?subscriber_id=xxx[&site_id=yyy]
 *
 * Returns the Infrastructure milestone status for one business — 5 cards
 * (Subscription, Connections, GBP, Website, Search Console), each with
 * sub_tasks. Stateless compute; reads current signals only.
 *
 * Site resolution mirrors /api/ops/provisioning: explicit site_id wins;
 * fallback to earliest active business under the subscriber. The fallback
 * is wrong for multi-business subscribers — callers should pass site_id
 * whenever they have one.
 */
import { isAdminRequest } from "@/lib/admin-session";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { computeInfrastructureStatus } from "@/lib/infrastructure/status";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const subscriberId = url.searchParams.get("subscriber_id");
  const explicitSiteId = url.searchParams.get("site_id");
  if (!subscriberId) {
    return NextResponse.json({ error: "subscriber_id required" }, { status: 400 });
  }

  let businessId: string | null = null;
  if (explicitSiteId && explicitSiteId !== "all") {
    const [row] = await sql`
      SELECT id FROM businesses
      WHERE id = ${explicitSiteId} AND billing_account_id = ${subscriberId} AND is_active = true
      LIMIT 1
    `;
    businessId = row ? (row.id as string) : null;
  }
  if (!businessId) {
    const [siteRow] = await sql`
      SELECT id FROM businesses
      WHERE billing_account_id = ${subscriberId} AND is_active = true
      ORDER BY created_at ASC LIMIT 1
    `;
    businessId = siteRow ? (siteRow.id as string) : null;
  }

  if (!businessId) {
    return NextResponse.json({
      businessId: null,
      cards: [],
      totals: { complete: 0, total: 0 },
    });
  }

  const status = await computeInfrastructureStatus({ businessId, subscriberId });
  return NextResponse.json({ businessId, ...status });
}
