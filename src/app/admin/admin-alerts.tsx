import { sql } from "@/lib/db";
import Link from "next/link";

interface Alert {
  type: "new_subscriber" | "token_expiring" | "pipeline_error" | "gbp_pending" | "log_errors";
  severity: "warning" | "danger" | "info";
  title: string;
  detail: string;
  href: string;
  timestamp: string;
}

async function fetchLogCounts(): Promise<{ errors: number; warnings: number }> {
  const token = process.env.AXIOM_TOKEN;
  const dataset = process.env.AXIOM_DATASET || "vercel";
  if (!token) return { errors: 0, warnings: 0 };

  try {
    const startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const res = await fetch("https://api.axiom.co/v1/datasets/_apl?format=tabular", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        apl: `['${dataset}'] | where level == "error" or level == "warning" | summarize count() by level`,
        startTime,
        endTime: new Date().toISOString(),
      }),
      next: { revalidate: 120 },
    });
    if (!res.ok) return { errors: 0, warnings: 0 };
    const data = await res.json();
    const cols = data.tables?.[0]?.columns || [];
    const levels = cols[0] || [];
    const counts = cols[1] || [];
    let errors = 0, warnings = 0;
    for (let i = 0; i < levels.length; i++) {
      if (levels[i] === "error") errors = counts[i];
      if (levels[i] === "warning") warnings = counts[i];
    }
    return { errors, warnings };
  } catch {
    return { errors: 0, warnings: 0 };
  }
}

export async function AdminAlerts() {
  const alerts: Alert[] = [];

  const [newSubscribers, expiringTokens, pendingGbp, logCounts] = await Promise.all([
    // Sites with provisioning explicitly requested by subscriber
    sql`
      SELECT sub.id AS subscription_id, u.name AS subscriber_name,
             s.name AS site_name, s.metadata AS site_metadata, s.created_at
      FROM subscriptions sub
      JOIN users u ON u.subscription_id = sub.id AND u.role = 'owner'
      JOIN sites s ON s.subscription_id = sub.id
      WHERE s.provisioning_status = 'requested'
        AND s.is_active = true
      ORDER BY s.created_at DESC
    `,
    // Social accounts with tokens expiring in the next 7 days
    sql`
      SELECT sa.id, sa.platform, sa.account_name, sa.token_expires_at,
             sub.id AS subscription_id, u.name AS subscriber_name
      FROM social_accounts sa
      JOIN subscriptions sub ON sa.subscription_id = sub.id
      JOIN users u ON u.subscription_id = sub.id AND u.role = 'owner'
      WHERE sa.status = 'active'
        AND sa.token_expires_at IS NOT NULL
        AND sa.token_expires_at < NOW() + INTERVAL '7 days'
        AND sa.token_expires_at > NOW()
      ORDER BY sa.token_expires_at ASC
    `,
    // Pending GBP location assignments
    sql`
      SELECT sa.id, sa.account_name, sa.metadata, sa.created_at
      FROM social_accounts sa
      WHERE sa.platform = 'gbp'
        AND sa.status = 'pending_assignment'
      ORDER BY sa.created_at DESC
    `,
    fetchLogCounts(),
  ]);

  for (const sub of newSubscribers) {
    const meta = (sub.site_metadata || {}) as Record<string, unknown>;
    const existing = (meta.existing_accounts || []) as string[];
    const toCreate = 8 - existing.length;
    const detail = toCreate > 0
      ? `${sub.subscriber_name} — create ${toCreate} account${toCreate !== 1 ? "s" : ""}${existing.length > 0 ? `, link ${existing.length}` : ""}`
      : `${sub.subscriber_name} — link ${existing.length} existing accounts`;
    alerts.push({
      type: "new_subscriber",
      severity: "info",
      title: `Provision: ${sub.site_name}`,
      detail,
      href: `/admin/provisioning`,
      timestamp: sub.created_at as string,
    });
  }

  for (const token of expiringTokens) {
    const daysLeft = Math.ceil(
      (new Date(token.token_expires_at as string).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    alerts.push({
      type: "token_expiring",
      severity: daysLeft <= 2 ? "danger" : "warning",
      title: `Token expiring: ${token.account_name}`,
      detail: `${token.platform} — ${daysLeft}d left — ${token.subscriber_name}`,
      href: `/admin/subscribers/${token.subscription_id}`,
      timestamp: token.token_expires_at as string,
    });
  }

  for (const gbp of pendingGbp) {
    const meta = (gbp.metadata || {}) as Record<string, unknown>;
    const locationCount = ((meta.discovered_locations || []) as unknown[]).length;
    alerts.push({
      type: "gbp_pending",
      severity: "warning",
      title: "Pick GBP location",
      detail: `${meta.initiating_site_name || gbp.account_name} — ${locationCount} location${locationCount !== 1 ? "s" : ""} found`,
      href: `/admin/google/location-picker`,
      timestamp: gbp.created_at as string,
    });
  }

  if (logCounts.errors > 0) {
    alerts.push({
      type: "log_errors",
      severity: "danger",
      title: `${logCounts.errors} error${logCounts.errors !== 1 ? "s" : ""} in the last hour`,
      detail: logCounts.warnings > 0 ? `+ ${logCounts.warnings} warning${logCounts.warnings !== 1 ? "s" : ""}` : "View logs for details",
      href: "/admin/logs?severity=error",
      timestamp: new Date().toISOString(),
    });
  } else if (logCounts.warnings > 0) {
    alerts.push({
      type: "log_errors",
      severity: "warning",
      title: `${logCounts.warnings} warning${logCounts.warnings !== 1 ? "s" : ""} in the last hour`,
      detail: "View logs for details",
      href: "/admin/logs?severity=warning",
      timestamp: new Date().toISOString(),
    });
  }

  if (alerts.length === 0) return null;

  const severityOrder = { danger: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  const severityColors = {
    danger: { bg: "bg-danger/10", text: "text-danger", dot: "bg-danger" },
    warning: { bg: "bg-warning/10", text: "text-warning", dot: "bg-warning" },
    info: { bg: "bg-accent/10", text: "text-accent", dot: "bg-accent" },
  };

  return (
    <aside className="w-72 shrink-0 overflow-y-auto border-l border-border bg-surface p-4">
      <h3 className="mb-3 text-xs font-medium text-muted">
        Action Queue ({alerts.length})
      </h3>
      <div className="space-y-2">
        {alerts.map((alert, i) => {
          const colors = severityColors[alert.severity];
          return (
            <Link
              key={i}
              href={alert.href}
              className={`block rounded-lg ${colors.bg} p-3 transition-opacity hover:opacity-80`}
            >
              <div className="flex items-start gap-2">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${colors.dot}`} />
                <div className="min-w-0">
                  <p className={`text-xs font-medium ${colors.text}`}>{alert.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-muted">{alert.detail}</p>
                  <p className="mt-1 text-[10px] text-muted">
                    {timeAgo(alert.timestamp)}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
