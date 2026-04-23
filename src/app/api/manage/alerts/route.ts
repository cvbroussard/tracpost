import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/manage/alerts?range=today|yesterday|7d|30d
 * Returns alert events across 5 categories for the ribbon timeline.
 */
export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const range = new URL(req.url).searchParams.get("range") || "today";
  let since: Date;
  const now = new Date();

  switch (range) {
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      y.setHours(0, 0, 0, 0);
      since = y;
      break;
    }
    case "7d":
      since = new Date(now.getTime() - 7 * 86400000);
      break;
    case "30d":
      since = new Date(now.getTime() - 30 * 86400000);
      break;
    default: {
      const t = new Date(now);
      t.setHours(0, 0, 0, 0);
      since = t;
    }
  }

  const sinceStr = since.toISOString();

  const [
    provisioningAlerts,
    connectionAlerts,
    pendingGbp,
    pageScoreAlerts,
    notificationAlerts,
  ] = await Promise.all([
    // Provisioning — requested sites
    sql`
      SELECT s.id, s.name, u.name AS subscriber_name, s.created_at AS timestamp
      FROM sites s
      JOIN subscriptions sub ON sub.id = s.subscription_id
      JOIN users u ON u.subscription_id = sub.id AND u.role = 'owner'
      WHERE s.provisioning_status = 'requested'
        AND s.is_active = true
        AND s.created_at >= ${sinceStr}
      ORDER BY s.created_at DESC
    `,

    // Connections — expiring or expired tokens
    sql`
      SELECT sa.id, sa.platform, sa.account_name, sa.token_expires_at AS timestamp,
             u.name AS subscriber_name
      FROM social_accounts sa
      JOIN subscriptions sub ON sa.subscription_id = sub.id
      JOIN users u ON u.subscription_id = sub.id AND u.role = 'owner'
      WHERE sa.status = 'active'
        AND sa.token_expires_at IS NOT NULL
        AND sa.token_expires_at < NOW() + INTERVAL '7 days'
      ORDER BY sa.token_expires_at ASC
    `,

    // Provisioning — pending GBP assignments
    sql`
      SELECT sa.id, sa.account_name, sa.metadata, sa.created_at AS timestamp
      FROM social_accounts sa
      WHERE sa.platform = 'gbp'
        AND sa.status = 'pending_assignment'
      ORDER BY sa.created_at DESC
    `,

    // Performance — pages scoring below 70
    sql`
      SELECT ps.url, ps.performance, ps.scored_at AS timestamp,
             s.name AS site_name
      FROM page_scores ps
      JOIN sites s ON s.id = ps.site_id
      WHERE ps.performance < 70
        AND ps.scored_at >= ${sinceStr}
      ORDER BY ps.scored_at DESC
      LIMIT 20
    `,

    // Content + Billing — from notifications table
    sql`
      SELECT id, category, severity, title, body, metadata, created_at AS timestamp
      FROM notifications
      WHERE created_at >= ${sinceStr}
      ORDER BY created_at DESC
      LIMIT 50
    `,
  ]);

  const events: Array<{
    id: string;
    category: string;
    severity: string;
    title: string;
    detail: string;
    href: string;
    timestamp: string;
  }> = [];

  // Map provisioning
  for (const p of provisioningAlerts) {
    events.push({
      id: `prov-${p.id}`,
      category: "provisioning",
      severity: "info",
      title: `Provision: ${p.name}`,
      detail: String(p.subscriber_name),
      href: "/manage/onboarding",
      timestamp: String(p.timestamp),
    });
  }

  // Map pending GBP
  for (const g of pendingGbp) {
    const meta = (g.metadata || {}) as Record<string, unknown>;
    events.push({
      id: `gbp-${g.id}`,
      category: "provisioning",
      severity: "warning",
      title: "GBP location pending",
      detail: (meta.initiating_site_name as string) || String(g.account_name),
      href: "/manage/gbp-assignment",
      timestamp: String(g.timestamp),
    });
  }

  // Map connection alerts
  for (const c of connectionAlerts) {
    const expiresAt = new Date(c.timestamp as string);
    const isExpired = expiresAt < now;
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / 86400000);
    events.push({
      id: `conn-${c.id}`,
      category: "connections",
      severity: isExpired ? "danger" : daysLeft <= 2 ? "danger" : "warning",
      title: `${c.platform} ${isExpired ? "expired" : `expires in ${daysLeft}d`}`,
      detail: `${c.account_name} · ${c.subscriber_name}`,
      href: "/manage/connections",
      timestamp: String(c.timestamp),
    });
  }

  // Map performance
  for (const p of pageScoreAlerts) {
    events.push({
      id: `perf-${p.url}-${p.timestamp}`,
      category: "performance",
      severity: (p.performance as number) < 50 ? "danger" : "warning",
      title: `PageSpeed ${p.performance}`,
      detail: `${p.site_name} · ${String(p.url).replace(/https?:\/\/[^/]+/, "")}`,
      href: "/manage/pagespeed",
      timestamp: String(p.timestamp),
    });
  }

  // Map notifications → content or billing
  for (const n of notificationAlerts) {
    const cat = (n.category as string);
    let mappedCategory = "content";
    if (cat === "billing" || cat === "disputes") mappedCategory = "billing";
    else if (cat === "campaigns" || cat === "quality") mappedCategory = "content";

    events.push({
      id: `notif-${n.id}`,
      category: mappedCategory,
      severity: (n.severity as string) || "info",
      title: String(n.title),
      detail: String(n.body).slice(0, 80),
      href: "/manage/pipeline",
      timestamp: String(n.timestamp),
    });
  }

  // Sort by timestamp descending
  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return NextResponse.json({ events, count: events.length });
}
