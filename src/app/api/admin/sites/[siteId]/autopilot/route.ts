import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/sites/[siteId]/autopilot
 *
 * Actions:
 *   { action: "publish" }         → trigger autopilot publish now
 *   { action: "refresh_tokens" }  → attempt to recover expired tokens
 *   { action: "status" }          → return current autopilot state
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action || "status";

  const [site] = await sql`SELECT id FROM sites WHERE id = ${siteId}`;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  if (action === "publish") {
    const { autopilotPublish } = await import("@/lib/pipeline/autopilot-publisher");
    const results = await autopilotPublish(siteId, { force: true });
    return NextResponse.json({ success: true, results });
  }

  if (action === "refresh_tokens") {
    const { forceRefreshExpired } = await import("@/lib/pipeline/token-refresh");
    const results = await forceRefreshExpired(siteId);
    return NextResponse.json({ success: true, ...results });
  }

  if (action === "status") {
    const [config] = await sql`
      SELECT autopilot_enabled, cadence_config FROM sites WHERE id = ${siteId}
    `;
    const accounts = await sql`
      SELECT sa.platform, sa.status, sa.account_name
      FROM social_accounts sa
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId}
      ORDER BY sa.platform
    `;
    const [postCounts] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE sp.status = 'published')::int AS published,
        COUNT(*) FILTER (WHERE sp.status = 'held')::int AS held,
        COUNT(*) FILTER (WHERE sp.status = 'failed')::int AS failed
      FROM social_posts sp
      JOIN social_accounts sa ON sp.account_id = sa.id
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId}
    `;
    return NextResponse.json({
      autopilot_enabled: config?.autopilot_enabled,
      accounts: accounts.map((a) => ({
        platform: a.platform,
        status: a.status,
        name: a.account_name,
      })),
      posts: postCounts,
    });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
