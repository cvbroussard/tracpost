import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { ApiKeySection } from "./api-key-section";
import { AccountActions } from "./account-actions";
import { OnboardingTip } from "@/components/onboarding-tip";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="mx-auto max-w-4xl">
        <h1>Settings</h1>
        <p className="mt-2 py-12 text-center text-muted">No site configured yet.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [site] = await sql`
    SELECT s.name, s.url, s.brand_voice, s.autopilot_enabled, s.cadence_config,
           s.content_pillars, s.autopilot_config, s.created_at,
           s.deletion_requested_at, s.deletion_status,
           sub.name AS subscriber_name, sub.plan, sub.cancelled_at
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
      <h1>Settings</h1>
      <p className="mt-2 mb-8 text-muted">Site configuration and autopilot settings</p>

      {/* Site Info */}
      <section className="mb-8">
        <h2 className="mb-4">Site Info</h2>
        <div className="space-y-3">
          <div className="flex items-baseline justify-between border-b border-border py-2">
            <span className="text-sm text-muted">Site Name</span>
            <span className="font-medium">{site?.name || "—"}</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-border py-2">
            <span className="text-sm text-muted">Site URL</span>
            <span className="font-medium">{site?.url || "—"}</span>
          </div>
          <div className="flex items-baseline justify-between border-b border-border py-2">
            <span className="text-sm text-muted">Plan</span>
            <span className="font-medium">{site?.plan || "—"}</span>
          </div>
        </div>
      </section>

      {/* Autopilot */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2>Autopilot</h2>
          <span className={`text-sm ${site?.autopilot_enabled ? "text-success" : "text-muted"}`}>
            {site?.autopilot_enabled ? "Active" : "Off"}
          </span>
        </div>

        {Object.keys(cadence).length > 0 && (
          <div className="mb-5">
            <label className="mb-2 block text-sm text-muted">Publishing Cadence</label>
            <div className="flex flex-wrap gap-6">
              {Object.entries(cadence).map(([platform, count]) => (
                <div key={platform}>
                  <p className="text-2xl font-semibold">{count}</p>
                  <p className="text-sm text-muted">{platform}/week</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {pillars.length > 0 && (
          <div className="mb-5">
            <label className="mb-2 block text-sm text-muted">Content Pillars</label>
            <div className="flex flex-wrap gap-2">
              {pillars.map((p) => (
                <span key={p} className="rounded bg-accent/10 px-2 py-1 text-sm text-accent">{p}</span>
              ))}
            </div>
          </div>
        )}

        {Object.keys(autopilotConfig).length > 0 && (
          <div>
            <label className="mb-2 block text-sm text-muted">Configuration</label>
            <div className="space-y-2">
              {Object.entries(autopilotConfig).map(([key, val]) => (
                <div key={key} className="flex justify-between border-b border-border py-2 text-sm">
                  <span className="text-muted">{key.replace(/_/g, " ")}</span>
                  <span className="font-medium">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Brand Voice */}
      <section className="mb-8">
        <h2 className="mb-4">Brand Voice</h2>
        {Object.keys(brandVoice).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(brandVoice).map(([key, val]) => (
              <div key={key} className="flex items-baseline justify-between border-b border-border py-2">
                <span className="text-sm text-muted">{key}</span>
                <span className="max-w-xs text-right font-medium">
                  {Array.isArray(val) ? val.join(", ") : String(val)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            No brand voice configured. Complete the Brand Intelligence wizard to generate one.
          </p>
        )}
      </section>

      <ApiKeySection />

      <AccountActions
        cancelledAt={site?.cancelled_at ? String(site.cancelled_at) : null}
        siteId={siteId}
        siteName={site?.name ? String(site.name) : "this site"}
        deletionStatus={site?.deletion_status ? String(site.deletion_status) : null}
        deletionRequestedAt={site?.deletion_requested_at ? String(site.deletion_requested_at) : null}
      />
    </div>
  );
}
