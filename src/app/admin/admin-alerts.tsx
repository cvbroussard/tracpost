import { sql } from "@/lib/db";
import Link from "next/link";

interface Alert {
  type: "deletion_request" | "new_subscriber" | "token_expiring" | "pipeline_error";
  severity: "warning" | "danger" | "info";
  title: string;
  detail: string;
  href: string;
  timestamp: string;
}

export async function AdminAlerts() {
  const alerts: Alert[] = [];

  const [deletionRequests, newSubscribers, expiringTokens] = await Promise.all([
    // Pending site deletion requests
    sql`
      SELECT s.id AS site_id, s.name AS site_name, s.deletion_requested_at, s.deletion_reason,
             sub.id AS subscriber_id, sub.name AS subscriber_name
      FROM sites s
      JOIN subscribers sub ON s.subscriber_id = sub.id
      WHERE s.deletion_status = 'pending' AND s.deleted_at IS NULL
      ORDER BY s.deletion_requested_at ASC
    `,
    // Sites with provisioning explicitly requested by subscriber
    sql`
      SELECT sub.id AS subscriber_id, sub.name AS subscriber_name, s.name AS site_name, s.created_at
      FROM subscribers sub
      JOIN sites s ON s.subscriber_id = sub.id
      WHERE s.provisioning_status = 'requested'
        AND s.deleted_at IS NULL
      ORDER BY s.created_at DESC
    `,
    // Social accounts with tokens expiring in the next 7 days
    sql`
      SELECT sa.id, sa.platform, sa.account_name, sa.token_expires_at,
             sub.id AS subscriber_id, sub.name AS subscriber_name
      FROM social_accounts sa
      JOIN subscribers sub ON sa.subscriber_id = sub.id
      WHERE sa.status = 'active'
        AND sa.token_expires_at IS NOT NULL
        AND sa.token_expires_at < NOW() + INTERVAL '7 days'
        AND sa.token_expires_at > NOW()
      ORDER BY sa.token_expires_at ASC
    `,
  ]);

  for (const req of deletionRequests) {
    alerts.push({
      type: "deletion_request",
      severity: "warning",
      title: `Delete request: ${req.site_name}`,
      detail: req.deletion_reason
        ? `${req.subscriber_name} — "${req.deletion_reason}"`
        : req.subscriber_name as string,
      href: `/admin/subscribers/${req.subscriber_id}`,
      timestamp: req.deletion_requested_at as string,
    });
  }

  for (const sub of newSubscribers) {
    alerts.push({
      type: "new_subscriber",
      severity: "info",
      title: `Needs provisioning: ${sub.site_name}`,
      detail: `${sub.subscriber_name} — no playbook yet`,
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
      href: `/admin/subscribers/${token.subscriber_id}`,
      timestamp: token.token_expires_at as string,
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
