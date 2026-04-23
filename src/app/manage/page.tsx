"use client";

import { useState, useEffect } from "react";
import { useManageContext } from "@/components/manage/manage-context";

interface SiteOverview {
  site: {
    name: string;
    url: string | null;
    business_type: string;
    location: string;
    autopilot_enabled: boolean;
    provisioning_status: string;
    subscriber_name: string;
    plan: string;
  };
  counts: {
    total_assets: number;
    uploads: number;
    ai_assets: number;
    total_posts: number;
    published_posts: number;
    draft_posts: number;
    vendors: number;
    projects: number;
    personas: number;
  };
  platforms: Array<{ platform: string; account_name: string; status: string }>;
}

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-hover p-3">
      <p className={`text-lg font-semibold ${accent ? "text-success" : ""}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-border last:border-0">
      <span className="text-[10px] text-muted">{label}</span>
      <span className="text-xs font-medium">{String(value)}</span>
    </div>
  );
}

function SiteOverviewContent({ siteId }: { siteId: string }) {
  const [data, setData] = useState<SiteOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/manage/site?site_id=${siteId}&view=overview`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!data) return <p className="p-6 text-xs text-muted">Failed to load site data.</p>;

  const { site, counts, platforms } = data;

  return (
    <div className="p-4 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Total Assets" value={counts.total_assets} />
            <Stat label="Uploads" value={counts.uploads} />
            <Stat label="AI Generated" value={counts.ai_assets} />
            <Stat label="Published" value={counts.published_posts} accent />
            <Stat label="Drafts" value={counts.draft_posts} />
            <Stat label="Total Articles" value={counts.total_posts} />
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Connected Platforms ({platforms.length})</h3>
            {platforms.length > 0 ? (
              <div className="space-y-1.5">
                {platforms.map(p => (
                  <div key={p.platform} className="flex items-center justify-between py-1">
                    <span className="text-xs capitalize">{p.platform}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted">{p.account_name}</span>
                      <span className={`h-1.5 w-1.5 rounded-full ${p.status === "active" ? "bg-success" : "bg-muted"}`} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-muted">No platforms connected.</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Identity</h3>
            <Row label="Business Name" value={site.name} />
            <Row label="Website" value={site.url || "—"} />
            <Row label="Industry" value={site.business_type} />
            <Row label="Location" value={site.location} />
            <Row label="Autopilot" value={site.autopilot_enabled ? "Active" : "Off"} />
            <Row label="Status" value={site.provisioning_status} />
          </div>

          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Content Pipeline</h3>
            <Row label="Vendors" value={counts.vendors} />
            <Row label="Projects" value={counts.projects} />
            <Row label="Personas" value={counts.personas} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ManageDashboard() {
  const { subscriberId, siteId } = useManageContext();

  if (subscriberId === "all") return null;
  if (siteId === "all") {
    return (
      <div className="p-6">
        <p className="text-xs text-muted">Select a site to view the overview.</p>
      </div>
    );
  }

  return <SiteOverviewContent siteId={siteId} />;
}
