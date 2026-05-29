"use client";

import { useState, useEffect, useCallback } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { PlatformIcon } from "@/components/platform-icon";

interface AssetRow {
  id: string;
  platform: string;
  asset_name: string;
  health_status: string;
  imported_at: string | null;
  created_at: string;
  primary_site_name: string | null;
  gbp_profile_snapshot: Record<string, unknown> | null;
  historical_count: number;
}

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  gbp: "Google Business Profile",
  linkedin: "LinkedIn",
};

function OnboardingContent({ subscriberId, siteId }: { subscriberId: string; siteId: string }) {
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    const siteParam = siteId !== "all" ? `&site_id=${siteId}` : "";
    fetch(`/api/admin/instant-import?subscription_id=${subscriberId}${siteParam}`)
      .then(r => r.ok ? r.json() : { assets: [] })
      .then(d => setAssets(d.assets || []))
      .finally(() => setLoading(false));
  }, [subscriberId, siteId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const siteScoped = siteId !== "all";

  async function runImports() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/instant-import", { method: "POST" });
      const d = await res.json();
      setMessage(`${d.imported} imported, ${d.skipped} skipped, ${d.errored} errored (of ${d.candidates} candidates)`);
      load();
    } catch {
      setMessage("Import run failed");
    }
    setRunning(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const pending = assets.filter(a => !a.imported_at && a.primary_site_name);
  const blocked = assets.filter(a => !a.imported_at && !a.primary_site_name);
  const done = assets.filter(a => !!a.imported_at);

  return (
    <div className="p-4 space-y-4">
      {message && (
        <div className="rounded-lg bg-success/10 px-4 py-2 text-xs text-success">{message}</div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Instant Import</h2>
          <p className="text-[11px] text-muted mt-0.5">
            One-time pull of platform-side reference data when an asset is assigned to a site.
            Runs automatically every 15 minutes via cron.
            {siteScoped && " · Showing assets assigned to this site only — switch site filter to 'All sites' to see unassigned orphans."}
          </p>
        </div>
        <button
          onClick={runImports}
          disabled={running || pending.length === 0}
          className="rounded border border-border px-3 py-1.5 text-[11px] font-medium text-muted hover:text-foreground hover:bg-surface-hover disabled:opacity-40"
          title={pending.length === 0 ? "Nothing pending" : `${pending.length} asset${pending.length === 1 ? "" : "s"} ready to import`}
        >
          {running ? "Running…" : `Run now (${pending.length})`}
        </button>
      </div>

      {assets.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted shadow-card">
          No platform assets connected yet. Connect a Meta or Google account first.
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <Section title={`Pending (${pending.length})`} accent="warning">
              {pending.map(a => <AssetCard key={a.id} asset={a} />)}
            </Section>
          )}
          {blocked.length > 0 && (
            <Section title={`Awaiting site assignment (${blocked.length})`} accent="muted">
              {blocked.map(a => <AssetCard key={a.id} asset={a} />)}
            </Section>
          )}
          {done.length > 0 && (
            <Section title={`Imported (${done.length})`} accent="success">
              {done.map(a => <AssetCard key={a.id} asset={a} />)}
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent: "warning" | "success" | "muted"; children: React.ReactNode }) {
  const accentClass = accent === "warning" ? "text-warning" : accent === "success" ? "text-success" : "text-muted";
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-wide font-medium mb-2 ${accentClass}`}>{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function AssetCard({ asset }: { asset: AssetRow }) {
  const summary: string[] = [];
  if (asset.gbp_profile_snapshot && asset.imported_at) {
    const p = asset.gbp_profile_snapshot as Record<string, unknown>;
    if (p.primary_phone) summary.push(`📞 ${p.primary_phone}`);
    if (p.primary_category) summary.push(`🏷 ${p.primary_category}`);
    if (p.website_uri) summary.push(`🌐 ${String(p.website_uri).replace(/^https?:\/\//, "")}`);
  }
  if (asset.historical_count > 0) {
    const noun = asset.platform === "gbp" ? "photos" : asset.platform === "facebook" ? "posts" : "media";
    summary.push(`📸 ${asset.historical_count} historical ${noun}`);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
      <div className="flex items-center gap-3">
        <PlatformIcon platform={asset.platform} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium">{asset.asset_name}</span>
            <span className="text-[10px] text-muted">{PLATFORM_LABEL[asset.platform] || asset.platform}</span>
          </div>
          <p className="text-[10px] text-muted mt-0.5">
            {asset.primary_site_name ? `→ ${asset.primary_site_name}` : "Not assigned to a site"}
          </p>
          {summary.length > 0 && (
            <p className="text-[10px] text-muted mt-1">{summary.join("  ·  ")}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          {asset.imported_at ? (
            <span className="rounded bg-success/10 text-success px-2 py-0.5 text-[10px] font-medium" title={new Date(asset.imported_at).toLocaleString()}>
              Imported
            </span>
          ) : asset.primary_site_name ? (
            <span className="rounded bg-warning/10 text-warning px-2 py-0.5 text-[10px] font-medium">Pending</span>
          ) : (
            <span className="rounded bg-surface-hover text-muted px-2 py-0.5 text-[10px] font-medium">Awaiting assignment</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Onboarding">
      {({ subscriberId, siteId }) => <OnboardingContent subscriberId={subscriberId} siteId={siteId} />}
    </ManagePage>
  );
}
