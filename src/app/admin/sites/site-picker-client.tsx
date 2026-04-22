"use client";

import { useState } from "react";
import Link from "next/link";

interface SiteItem {
  id: string;
  name: string;
  subscriberName: string;
  plan: string;
  assetCount: number;
  publishedPosts: number;
  provisioningStatus: string;
  autopilotEnabled: boolean;
}

export function SitePickerClient({ sites }: { sites: SiteItem[] }) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? sites.filter((s) =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.subscriberName.toLowerCase().includes(search.toLowerCase())
      )
    : sites;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">Site Controls</h1>
          <p className="text-xs text-muted">{sites.length} active sites</p>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search sites..."
          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs w-64 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {filtered.map((site) => (
          <Link
            key={site.id}
            href={`/admin/sites/${site.id}`}
            className="rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/30"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium">{site.name}</p>
                <p className="mt-0.5 text-xs text-muted">{site.subscriberName} · {site.plan}</p>
              </div>
              <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                site.provisioningStatus === "complete" ? "bg-success/10 text-success"
                  : site.provisioningStatus === "in_progress" ? "bg-accent/10 text-accent"
                  : "bg-muted/10 text-muted"
              }`}>
                {site.provisioningStatus}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs">
              <div>
                <span className="font-medium">{site.assetCount}</span>
                <span className="ml-1 text-muted">assets</span>
              </div>
              <div>
                <span className="font-medium text-success">{site.publishedPosts}</span>
                <span className="ml-1 text-muted">published</span>
              </div>
              {site.autopilotEnabled && (
                <span className="rounded bg-success/10 px-1.5 py-0.5 text-[9px] text-success">Autopilot</span>
              )}
            </div>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-sm text-muted">No sites match "{search}"</p>
        </div>
      )}
    </div>
  );
}
