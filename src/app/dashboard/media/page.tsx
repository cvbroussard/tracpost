import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MediaPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-lg font-semibold">Media Library</h1>
        <p className="py-12 text-center text-sm text-muted">Add a site first to start uploading media.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const assets = await sql`
    SELECT id, storage_url, media_type, context_note, triage_status,
           quality_score, content_pillar, platform_fit, flag_reason,
           shelve_reason, created_at
    FROM media_assets
    WHERE site_id = ${siteId}
    ORDER BY created_at DESC
    LIMIT 50
  `;

  const statusColors: Record<string, string> = {
    received: "text-muted",
    triaged: "text-accent",
    scheduled: "text-success",
    consumed: "text-success",
    shelved: "text-warning",
    flagged: "text-danger",
    rejected: "text-danger",
  };

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">Media Library</h1>
      <p className="mb-8 text-sm text-muted">Uploaded assets and their pipeline status</p>

      {assets.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Context</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Quality</th>
                <th className="px-4 py-3 font-medium">Pillar</th>
                <th className="px-4 py-3 font-medium">Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-3 text-xs">{a.media_type || "—"}</td>
                  <td className="max-w-xs truncate px-4 py-3">{a.context_note || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium ${statusColors[a.triage_status] || ""}`}>
                      {a.triage_status}
                    </span>
                    {a.flag_reason && (
                      <p className="mt-0.5 text-[10px] text-danger">{a.flag_reason}</p>
                    )}
                    {a.shelve_reason && (
                      <p className="mt-0.5 text-[10px] text-warning">{a.shelve_reason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {a.quality_score ? `${(a.quality_score * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {a.content_pillar ? (
                      <span className="rounded bg-surface px-2 py-0.5 text-xs">{a.content_pillar}</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">
                    {new Date(a.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-8 py-16 text-center">
          <span className="mb-3 text-3xl">▣</span>
          <h3 className="mb-1 text-sm font-medium">No media uploaded</h3>
          <p className="max-w-xs text-xs text-muted">
            Upload photos and videos via the API to start building your content pipeline.
          </p>
        </div>
      )}
    </div>
  );
}
