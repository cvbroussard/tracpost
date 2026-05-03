import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/manage/subscriber?id=xxx
 * Returns subscriber overview with all sites summary.
 */
export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const [subscriber] = await sql`
    SELECT sub.id, sub.plan, sub.is_active, sub.created_at, sub.metadata,
           u.name, u.email
    FROM subscriptions sub
    JOIN users u ON u.subscription_id = sub.id AND u.role = 'owner'
    WHERE sub.id = ${id}
  `;

  if (!subscriber) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sites = await sql`
    SELECT s.id, s.name, s.url, s.autopilot_enabled, s.provisioning_status,
           bs.custom_domain,
           (SELECT COUNT(*)::int FROM media_assets WHERE site_id = s.id) AS assets,
           (SELECT COUNT(*)::int FROM blog_posts WHERE site_id = s.id AND status = 'published') AS published,
           (SELECT COUNT(*)::int FROM social_accounts sa JOIN site_social_links ssl ON ssl.social_account_id = sa.id WHERE ssl.site_id = s.id AND sa.status = 'active') AS connections
    FROM sites s
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE s.subscription_id = ${id} AND s.is_active = true
    ORDER BY s.name
  `;

  return NextResponse.json({
    subscriber: {
      id: subscriber.id,
      name: subscriber.name,
      email: subscriber.email,
      plan: subscriber.plan,
      isActive: subscriber.is_active,
      createdAt: subscriber.created_at,
    },
    sites: sites.map(s => ({
      id: s.id,
      name: s.name,
      url: s.url,
      customDomain: s.custom_domain,
      autopilot: s.autopilot_enabled,
      status: s.provisioning_status,
      assets: s.assets,
      published: s.published,
      connections: s.connections,
    })),
  });
}
