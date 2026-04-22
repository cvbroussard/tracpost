import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect, notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ProjectPreviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) redirect("/dashboard");

  const { slug } = await params;
  const siteId = session.activeSiteId;

  // Fetch project
  const [project] = await sql`
    SELECT id, name, description, address, start_date, end_date, status
    FROM projects
    WHERE site_id = ${siteId} AND slug = ${slug}
  `;

  if (!project) notFound();

  const projectId = project.id as string;

  // Fetch assets with captions, chronologically ordered
  const assets = await sql`
    SELECT ma.id, ma.storage_url, ma.media_type, ma.context_note, ma.date_taken, ma.created_at, ma.metadata
    FROM media_assets ma
    JOIN asset_projects ap ON ap.asset_id = ma.id
    WHERE ap.project_id = ${projectId}
      AND ma.triage_status = 'triaged'
    ORDER BY ma.sort_order ASC NULLS LAST
  `;

  // Fetch brands used in this project
  const brands = await sql`
    SELECT DISTINCT b.id, b.name, b.url
    FROM brands b
    JOIN asset_brands ab ON ab.brand_id = b.id
    JOIN asset_projects ap ON ap.asset_id = ab.asset_id
    WHERE ap.project_id = ${projectId}
    ORDER BY b.name
  `;

  // Fetch personas (consent-gated)
  const personas = await sql`
    SELECT DISTINCT p.id, p.name, p.display_name, p.type, p.consent_given
    FROM personas p
    JOIN asset_personas ap ON ap.persona_id = p.id
    JOIN asset_projects aproj ON aproj.asset_id = ap.asset_id
    WHERE aproj.project_id = ${projectId}
  `;

  // Fetch location
  const [location] = await sql`
    SELECT DISTINCT l.name, l.address, l.city, l.state
    FROM locations l
    JOIN asset_locations al ON al.location_id = l.id
    JOIN asset_projects ap ON ap.asset_id = al.asset_id
    WHERE ap.project_id = ${projectId}
    LIMIT 1
  `;

  // Group assets by month for timeline
  const timeline = new Map<string, typeof assets>();
  for (const asset of assets) {
    const date = asset.date_taken || asset.created_at;
    const month = date ? new Date(date as string).toLocaleDateString("en-US", { year: "numeric", month: "long" }) : "Undated";
    if (!timeline.has(month)) timeline.set(month, []);
    timeline.get(month)!.push(asset);
  }

  const captionedCount = assets.filter((a) => a.context_note).length;
  const startDate = project.start_date ? new Date(project.start_date as string).toLocaleDateString("en-US", { year: "numeric", month: "long" }) : null;
  const endDate = project.end_date ? new Date(project.end_date as string).toLocaleDateString("en-US", { year: "numeric", month: "long" }) : null;

  return (
    <div className="p-4 space-y-6">
      {/* Preview banner */}
      <div className="mb-6 rounded bg-warning/10 px-4 py-2 text-center text-xs text-warning">
        Preview — this page is not published
      </div>

      {/* Hero */}
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
        {project.description && (
          <p className="mt-2 text-lg text-muted">{project.description}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted">
          {startDate && (
            <span>
              {startDate}{endDate && endDate !== startDate ? ` — ${endDate}` : ""}
            </span>
          )}
          {(location?.city || location?.state) && (
            <span>{[location.city, location.state].filter(Boolean).join(", ")}</span>
          )}
          {location?.address && (
            <span className="text-dim">{location.address}</span>
          )}
          <span className="text-dim">
            {assets.length} photo{assets.length !== 1 ? "s" : ""}
            {captionedCount > 0 && ` · ${captionedCount} captioned`}
          </span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
            project.status === "complete" ? "bg-success/15 text-success"
              : project.status === "active" ? "bg-accent/15 text-accent"
              : "bg-muted/15 text-muted"
          }`}>
            {project.status}
          </span>
        </div>
      </header>

      {/* Timeline */}
      {Array.from(timeline.entries()).map(([month, monthAssets]) => (
        <section key={month} className="mb-12">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-muted">{month}</h2>
          <div className="space-y-6">
            {monthAssets.map((asset) => {
              const isVideo = (asset.media_type as string) === "video";
              const dateTaken = asset.date_taken
                ? new Date(asset.date_taken as string).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : null;

              return (
                <div key={asset.id} className="group">
                  {/* Image */}
                  <div className="overflow-hidden rounded-lg bg-background">
                    {isVideo ? (
                      <video
                        src={asset.storage_url as string}
                        controls
                        className="w-full"
                        style={{ maxHeight: "60vh" }}
                        preload="metadata"
                      />
                    ) : (asset.storage_url as string).endsWith(".heic") ? (
                      <div className="flex h-48 items-center justify-center text-xs text-muted">
                        Processing...
                      </div>
                    ) : (
                      <img
                        src={asset.storage_url as string}
                        alt={asset.context_note as string || ""}
                        className="w-full object-contain"
                        style={{ maxHeight: "60vh" }}
                        loading="lazy"
                      />
                    )}
                  </div>

                  {/* Caption */}
                  {asset.context_note && (
                    <div className="mt-3">
                      <p className="text-sm leading-relaxed">
                        {asset.context_note as string}
                      </p>
                      {dateTaken && (
                        <p className="mt-1 text-xs text-dim">{dateTaken}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {/* Brands */}
      {brands.length > 0 && (
        <section className="mb-10 border-t border-border pt-8">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-muted">Materials & Equipment</h2>
          <div className="flex flex-wrap gap-3">
            {brands.map((b) => (
              <span key={b.id} className="rounded-lg border border-border px-3 py-1.5 text-sm">
                {b.url ? (
                  <a href={b.url as string} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    {b.name as string}
                  </a>
                ) : (
                  b.name as string
                )}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Personas */}
      {personas.length > 0 && (
        <section className="mb-10 border-t border-border pt-8">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-widest text-muted">People</h2>
          <div className="flex flex-wrap gap-3">
            {personas.map((p) => {
              const displayName = p.consent_given
                ? (p.name as string)
                : (p.display_name as string) || (p.type as string);
              return (
                <span key={p.id} className="rounded-lg border border-border px-3 py-1.5 text-sm">
                  {displayName}
                  <span className="ml-1.5 text-xs text-dim">{p.type as string}</span>
                </span>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty state */}
      {assets.length === 0 && (
        <div className="rounded-lg border border-dashed border-border px-8 py-16 text-center">
          <p className="text-muted">No assets assigned to this project yet.</p>
        </div>
      )}
    </div>
  );
}
