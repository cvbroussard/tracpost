import { sql } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function SitesPage() {
  const sites = await sql`
    SELECT s.id, s.name, s.url, s.business_type, s.provisioning_status,
           s.content_vibe, s.image_style, s.autopilot_enabled,
           sub.name AS subscriber_name, sub.plan,
           (SELECT COUNT(*)::int FROM media_assets WHERE site_id = s.id) AS asset_count,
           (SELECT COUNT(*)::int FROM blog_posts WHERE site_id = s.id AND status = 'published') AS published_posts
    FROM sites s
    JOIN subscribers sub ON sub.id = s.subscriber_id
    WHERE s.deleted_at IS NULL
    ORDER BY s.name ASC
  `;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">Site Controls</h1>
      <p className="mb-8 text-sm text-muted">Tune content direction, visual style, and publishing for each site</p>

      <div className="space-y-3">
        {sites.map((site) => (
          <Link
            key={site.id as string}
            href={`/admin/sites/${site.id}`}
            className="flex items-center justify-between rounded-lg border border-border bg-surface p-4 transition-colors hover:border-accent/30"
          >
            <div>
              <p className="text-sm font-medium">{site.name}</p>
              <p className="mt-0.5 text-xs text-muted">
                {site.subscriber_name} · {site.plan}
                {site.content_vibe && " · vibe set"}
                {site.image_style && " · style set"}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium">{site.asset_count}</p>
                <p className="text-[10px] text-muted">assets</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-success">{site.published_posts}</p>
                <p className="text-[10px] text-muted">published</p>
              </div>
              <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                site.provisioning_status === "complete" ? "bg-success/10 text-success"
                  : site.provisioning_status === "in_progress" ? "bg-accent/10 text-accent"
                  : "bg-muted/10 text-muted"
              }`}>
                {site.provisioning_status}
              </span>
              <span className="text-xs text-muted">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
