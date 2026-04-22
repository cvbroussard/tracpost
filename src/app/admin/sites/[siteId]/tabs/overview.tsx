"use client";

import type { SiteData, Counts, Platform } from "../site-tabs";

function Stat({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className={`text-lg font-semibold ${accent ? "text-success" : ""}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-[10px] text-muted">{label}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-[10px] text-muted">{label}</span>
      <span className="text-xs font-medium">{value || "—"}</span>
    </div>
  );
}

export function OverviewTab({
  site,
  counts,
  platforms,
}: {
  siteId: string;
  site: SiteData;
  counts: Counts;
  platforms: Platform[];
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Left column */}
      <div className="space-y-4">
        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Total Assets" value={counts.totalAssets} />
          <Stat label="Uploads" value={counts.uploads} />
          <Stat label="AI Generated" value={counts.aiAssets} />
          <Stat label="Published" value={counts.publishedPosts} accent />
          <Stat label="Drafts" value={counts.draftPosts} />
          <Stat label="Total Articles" value={counts.totalPosts} />
        </div>

        {/* Connected platforms */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Connected Platforms ({platforms.length})</h3>
          {platforms.length > 0 ? (
            <div className="space-y-1.5">
              {platforms.map((p) => (
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
            <p className="text-[10px] text-muted">No platforms connected yet.</p>
          )}
        </div>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        {/* Identity */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Identity</h3>
          <InfoRow label="Business Name" value={site.name} />
          <InfoRow label="Website" value={site.url || ""} />
          <InfoRow label="Industry" value={site.businessType} />
          <InfoRow label="Location" value={site.location} />
        </div>

        {/* Content stats */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Content Pipeline</h3>
          <InfoRow label="Vendors" value={counts.vendors} />
          <InfoRow label="Projects" value={counts.projects} />
          <InfoRow label="Personas" value={counts.personas} />
          <InfoRow label="Reward Prompts" value={counts.rewardPrompts} />
          <InfoRow label="Project Prompts" value={counts.projectPrompts} />
          <InfoRow label="Image Corrections" value={counts.corrections} />
        </div>

        {/* Quality gates */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Quality Gates</h3>
          <InfoRow label="Content Guard" value="Active" />
          <InfoRow label="Quality Cutoff" value="0.7" />
          <InfoRow label="URL Validation" value="Active" />
          <InfoRow label="Vendor Detection" value={`${counts.vendors} vendors`} />
        </div>
      </div>
    </div>
  );
}
