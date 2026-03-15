import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ApiKeySection } from "./api-key-section";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-1 text-lg font-semibold">Settings</h1>
        <p className="py-12 text-center text-sm text-muted">No site configured yet. Add one via the API.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [site] = await sql`
    SELECT s.name, s.url, s.brand_voice, s.autopilot_enabled, s.cadence_config,
           s.content_pillars, s.autopilot_config, s.created_at,
           sub.name AS subscriber_name, sub.plan
    FROM sites s
    JOIN subscribers sub ON s.subscriber_id = sub.id
    WHERE s.id = ${siteId}
  `;

  const brandVoice = (site?.brand_voice || {}) as Record<string, unknown>;
  const cadence = (site?.cadence_config || {}) as Record<string, number>;
  const pillars = (site?.content_pillars || []) as string[];
  const autopilotConfig = (site?.autopilot_config || {}) as Record<string, unknown>;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-lg font-semibold">Settings</h1>
      <p className="mb-8 text-sm text-muted">Site configuration and autopilot settings</p>

      <div className="space-y-6">
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium">Site Info</h2>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted">Site Name</label>
              <div className="rounded border border-border bg-background px-3 py-2 text-sm">
                {site?.name || "—"}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Site URL</label>
              <div className="rounded border border-border bg-background px-3 py-2 text-sm">
                {site?.url || "—"}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Plan</label>
              <div className="rounded border border-border bg-background px-3 py-2 text-sm">
                {site?.plan || "—"}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Autopilot</h2>
            <span className={`text-xs ${site?.autopilot_enabled ? "text-success" : "text-muted"}`}>
              {site?.autopilot_enabled ? "Active" : "Off"}
            </span>
          </div>

          {Object.keys(cadence).length > 0 && (
            <div className="mb-4">
              <label className="mb-2 block text-xs text-muted">Publishing Cadence</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(cadence).map(([platform, count]) => (
                  <div key={platform} className="rounded border border-border bg-background px-3 py-2 text-center">
                    <p className="text-sm font-medium">{count}</p>
                    <p className="text-[10px] text-muted">{platform}/week</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pillars.length > 0 && (
            <div className="mb-4">
              <label className="mb-2 block text-xs text-muted">Content Pillars</label>
              <div className="flex flex-wrap gap-2">
                {pillars.map((p) => (
                  <span key={p} className="rounded bg-accent/10 px-2 py-1 text-xs text-accent">{p}</span>
                ))}
              </div>
            </div>
          )}

          {Object.keys(autopilotConfig).length > 0 && (
            <div>
              <label className="mb-2 block text-xs text-muted">Configuration</label>
              <div className="space-y-1">
                {Object.entries(autopilotConfig).map(([key, val]) => (
                  <div key={key} className="flex justify-between text-xs">
                    <span className="text-muted">{key.replace(/_/g, " ")}</span>
                    <span>{String(val)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <ApiKeySection />

        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="mb-3 text-sm font-medium">Brand Voice</h2>
          {Object.keys(brandVoice).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(brandVoice).map(([key, val]) => (
                <div key={key}>
                  <label className="mb-1 block text-xs text-muted">{key}</label>
                  <div className="rounded border border-border bg-background px-3 py-2 text-sm">
                    {Array.isArray(val) ? val.join(", ") : String(val)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted">
              No brand voice configured. Set tone, keywords, and style via the API.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
