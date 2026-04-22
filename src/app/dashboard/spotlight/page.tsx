import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SpotlightPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const siteId = session.activeSiteId;

  const [recentSessions, [stats], kiosks] = await Promise.all([
    sql`
      SELECT id, session_code, status, photo_url, customer_name, star_rating,
             google_review_opened, photo_consent, captured_at, completed_at
      FROM spotlight_sessions
      WHERE site_id = ${siteId} AND subscription_id = ${session.subscriptionId}
      ORDER BY created_at DESC
      LIMIT 10
    `,
    sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
        COUNT(*) FILTER (WHERE google_review_opened = true)::int AS reviews,
        AVG(star_rating) FILTER (WHERE star_rating IS NOT NULL) AS avg_rating
      FROM spotlight_sessions
      WHERE site_id = ${siteId} AND subscription_id = ${session.subscriptionId}
    `,
    sql`
      SELECT id, name, is_active, last_seen_at
      FROM spotlight_kiosks
      WHERE site_id = ${siteId} AND is_active = true
    `,
  ]);

  const conversionRate = stats.total > 0
    ? ((stats.reviews / stats.total) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1>Spotlight</h1>
          <p className="mt-1 text-muted">Capture moments. Generate reviews.</p>
        </div>
        <Link
          href="/dashboard/spotlight/capture"
          className="rounded bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90"
        >
          Start Spotlight
        </Link>
      </div>

      {/* Stats */}
      <div className="mt-8 grid grid-cols-4 gap-6">
        <div>
          <p className="text-3xl font-semibold">{stats.total}</p>
          <p className="text-sm text-muted">Spotlights</p>
        </div>
        <div>
          <p className="text-3xl font-semibold">{stats.reviews}</p>
          <p className="text-sm text-muted">Reviews Opened</p>
        </div>
        <div>
          <p className="text-3xl font-semibold">{conversionRate}%</p>
          <p className="text-sm text-muted">Conversion</p>
        </div>
        <div>
          <p className="text-3xl font-semibold">
            {stats.avg_rating ? Number(stats.avg_rating).toFixed(1) : "—"}
          </p>
          <p className="text-sm text-muted">Avg Rating</p>
        </div>
      </div>

      {/* Kiosks */}
      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2>Kiosks</h2>
          <Link href="/dashboard/spotlight/kiosks" className="text-sm text-accent hover:text-accent/80">
            Manage
          </Link>
        </div>
        {kiosks.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            No kiosks registered. <Link href="/dashboard/spotlight/kiosks" className="text-accent">Set up a kiosk</Link> to get started.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {kiosks.map((k) => (
              <div key={k.id as string} className="flex items-center justify-between border-b border-border py-2">
                <span className="text-sm">{k.name as string}</span>
                <span className="text-xs text-muted">
                  {k.last_seen_at ? `Last seen ${new Date(k.last_seen_at as string).toLocaleDateString()}` : "Never connected"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recent Sessions */}
      <section className="mt-8">
        <h2 className="mb-4">Recent Spotlights</h2>
        {recentSessions.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No Spotlights yet. Tap "Start Spotlight" to capture your first moment.</p>
        ) : (
          <div>
            {recentSessions.map((s) => (
              <div key={s.id as string} className="flex items-center gap-3 border-b border-border py-3">
                {/* Photo thumb */}
                <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded bg-surface-hover">
                  {s.photo_url ? (
                    <img src={s.photo_url as string} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-muted">*</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    {(s.customer_name as string) || "Customer"}{" "}
                    {s.star_rating && <span className="text-yellow-500">{"★".repeat(s.star_rating as number)}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {s.status as string} · {s.captured_at ? new Date(s.captured_at as string).toLocaleDateString() : "—"}
                    {s.google_review_opened && " · Review opened"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
