import { sql } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface QueueRow {
  token: string;
  subscription_id: string;
  current_step: number;
  submitted_at: string | null;
  completed_at: string | null;
  expires_at: string;
  created_at: string;
  data: Record<string, unknown>;
  platform_status: Record<string, string>;
  owner_name: string | null;
  owner_email: string | null;
  plan: string;
}

const ALL_PLATFORMS = [
  "instagram",
  "facebook",
  "gbp",
  "linkedin",
  "youtube",
  "pinterest",
  "tiktok",
  "twitter",
];

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function urgencyBadge(submittedAt: string | null) {
  if (!submittedAt) return null;
  const hours = (Date.now() - new Date(submittedAt).getTime()) / 3600000;
  if (hours > 48)
    return { label: "Overdue", color: "bg-red-100 text-red-700 border-red-200" };
  if (hours > 24)
    return { label: "Aging", color: "bg-amber-100 text-amber-700 border-amber-200" };
  return null;
}

export default async function OnboardingQueuePage() {
  const submissions = (await sql`
    SELECT
      os.token,
      os.subscription_id,
      os.current_step,
      os.submitted_at,
      os.completed_at,
      os.expires_at,
      os.created_at,
      os.data,
      os.platform_status,
      u.name AS owner_name,
      u.email AS owner_email,
      sub.plan
    FROM onboarding_submissions os
    LEFT JOIN subscriptions sub ON sub.id = os.subscription_id
    LEFT JOIN users u ON u.subscription_id = os.subscription_id AND u.role = 'owner'
    WHERE os.completed_at IS NULL
    ORDER BY
      CASE WHEN os.submitted_at IS NOT NULL THEN 0 ELSE 1 END,
      os.submitted_at ASC NULLS LAST,
      os.created_at DESC
  `) as unknown as QueueRow[];

  const submitted = submissions.filter((s) => s.submitted_at);
  const inProgress = submissions.filter((s) => !s.submitted_at);

  return (
    <div className="mx-auto max-w-6xl">
      <h1>Onboarding Queue</h1>
      <p className="mt-2 mb-8 text-muted">
        Submissions awaiting operator review. Submitted ones are ready to provision; in-progress
        ones are still being filled out by the subscriber.
      </p>

      <div className="mb-6 flex gap-3">
        <StatPill label="Awaiting review" count={submitted.length} accent="blue" />
        <StatPill label="In progress" count={inProgress.length} accent="gray" />
      </div>

      <Section title="Awaiting review" empty="No submissions waiting">
        {submitted.map((s) => (
          <QueueRowCard key={s.token} row={s} highlight="submitted" />
        ))}
      </Section>

      <Section title="In progress" empty="No subscribers currently mid-form">
        {inProgress.map((s) => (
          <QueueRowCard key={s.token} row={s} highlight="in_progress" />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const childArr = Array.isArray(children) ? children : [children];
  const hasContent = childArr.some((c) => c !== null && c !== false);
  return (
    <section className="mb-10">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {hasContent ? (
        <div className="space-y-2">{children}</div>
      ) : (
        <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          {empty}
        </p>
      )}
    </section>
  );
}

function StatPill({
  label,
  count,
  accent,
}: {
  label: string;
  count: number;
  accent: "blue" | "gray";
}) {
  const colors =
    accent === "blue"
      ? "bg-accent/10 text-accent border-accent/20"
      : "bg-surface text-muted border-border";
  return (
    <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${colors}`}>
      <span className="font-semibold">{count}</span>
      <span>{label}</span>
    </div>
  );
}

function QueueRowCard({ row, highlight }: { row: QueueRow; highlight: "submitted" | "in_progress" }) {
  const data = row.data || {};
  const businessName = (data.business_name as string) || "(unnamed)";
  const platforms = row.platform_status || {};
  const connectedCount = ALL_PLATFORMS.filter((p) => platforms[p] === "connected").length;
  const failedCount = ALL_PLATFORMS.filter((p) => platforms[p] === "failed").length;
  const urgency = highlight === "submitted" ? urgencyBadge(row.submitted_at) : null;
  const submittedHint = row.submitted_at
    ? `Submitted ${timeSince(row.submitted_at)}`
    : `Started ${timeSince(row.created_at)} · step ${row.current_step}/7`;

  return (
    <Link
      href={`/admin/onboarding-queue/${row.token}`}
      className="block rounded-xl border border-border bg-surface px-5 py-4 transition-colors hover:border-foreground/20 hover:bg-surface-hover"
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-foreground">{businessName}</h3>
            {urgency && (
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${urgency.color}`}
              >
                {urgency.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted">
            {row.owner_name || "—"}{" "}
            <span className="text-dim">·</span>{" "}
            <span className="text-muted">{row.owner_email || "—"}</span>{" "}
            <span className="text-dim">·</span>{" "}
            <span className="capitalize text-muted">{row.plan || "—"}</span>
          </p>
          <p className="mt-1 text-xs text-dim">{submittedHint}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <PlatformBar count={connectedCount} total={ALL_PLATFORMS.length} failed={failedCount} />
          <span className="text-xs text-muted">
            {connectedCount}/{ALL_PLATFORMS.length} connected
            {failedCount > 0 && (
              <span className="ml-1.5 text-red-600">· {failedCount} failed</span>
            )}
          </span>
        </div>
      </div>
    </Link>
  );
}

function PlatformBar({
  count,
  total,
  failed,
}: {
  count: number;
  total: number;
  failed: number;
}) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: total }).map((_, i) => {
        const isFailed = i < failed;
        const isConnected = i < count && !isFailed;
        return (
          <span
            key={i}
            className={`h-2 w-4 rounded-sm ${
              isFailed
                ? "bg-red-400"
                : isConnected
                ? "bg-accent"
                : "bg-border"
            }`}
          />
        );
      })}
    </div>
  );
}
