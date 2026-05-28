import { sql } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminOverview() {
  const [subscriptions, sites, accounts, posts, assets] = await Promise.all([
    sql`SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE is_active) ::int AS active FROM accounts`,
    sql`SELECT COUNT(*)::int AS count FROM businesses`,
    sql`SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE status = 'active')::int AS active FROM social_accounts`,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'scheduled')::int AS scheduled,
        COUNT(*) FILTER (WHERE status = 'published')::int AS published,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM social_posts
    `,
    sql`
      SELECT
        COUNT(*) FILTER (WHERE processing_stage = 'onboarded')::int AS onboarded,
        COUNT(*) FILTER (WHERE processing_stage = 'briefed')::int AS briefed,
        COUNT(*) FILTER (WHERE processing_stage = 'analyzed')::int AS analyzed,
        COUNT(*) FILTER (WHERE processing_stage = 'failed')::int AS failed
      FROM media_assets
    `,
  ]);

  const stats = [
    { label: "Subscriptions", value: subscriptions[0].active, sub: `${subscriptions[0].count} total`, href: "/admin/subscribers" },
    { label: "Sites", value: sites[0].count, href: "/admin/subscribers" },
    { label: "Connections", value: accounts[0].active, sub: `${accounts[0].count} total`, href: "/admin/social" },
    { label: "Scheduled Posts", value: posts[0].scheduled, href: "/admin/content" },
    { label: "Published", value: posts[0].published, href: "/admin/content" },
    { label: "Failed", value: posts[0].failed, href: "/admin/pipeline", danger: posts[0].failed > 0 },
  ];

  const pipeline = [
    { label: "Onboarded (awaiting briefing)", value: assets[0].onboarded },
    { label: "Briefed", value: assets[0].briefed },
    { label: "Analyzed (ready)", value: assets[0].analyzed },
    { label: "Failed", value: assets[0].failed, danger: assets[0].failed > 0 },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <h1>Platform Overview</h1>
      <p className="mt-2 mb-8 text-muted">Cross-subscription health at a glance</p>

      <div className="mb-8 grid grid-cols-3 gap-8">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="group transition-colors"
          >
            <p className={`text-3xl font-semibold ${s.danger ? "text-danger" : ""}`}>
              {s.value}
            </p>
            <p className="text-sm text-muted group-hover:text-foreground">{s.label}</p>
            {s.sub && <p className="text-sm text-dim">{s.sub}</p>}
          </Link>
        ))}
      </div>

      <section>
        <h2 className="mb-4">Asset Pipeline</h2>
        <div className="grid grid-cols-4 gap-6">
          {pipeline.map((p) => (
            <div key={p.label}>
              <p className={`text-2xl font-semibold ${p.danger ? "text-danger" : ""}`}>
                {p.value}
              </p>
              <p className="text-sm text-muted">{p.label}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
