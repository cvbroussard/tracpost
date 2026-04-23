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

function Stat({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-surface-hover p-3">
      <p className={`text-lg font-semibold ${accent ? "text-success" : ""}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-[10px] text-muted">{label}</p>
      {sub && <p className="text-[9px] text-muted mt-0.5">{sub}</p>}
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

interface SubscriberData {
  subscriber: { id: string; name: string; email: string; plan: string; isActive: boolean; createdAt: string };
  sites: Array<{
    id: string; name: string; url: string | null; customDomain: string | null;
    autopilot: boolean; status: string; assets: number; published: number; connections: number;
  }>;
}

function SubscriberOverview({ subscriberId }: { subscriberId: string }) {
  const [data, setData] = useState<SubscriberData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/manage/subscriber?id=${subscriberId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [subscriberId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!data) return <p className="p-6 text-xs text-muted">Failed to load subscriber.</p>;

  const { subscriber, sites } = data;
  const totalAssets = sites.reduce((s, x) => s + x.assets, 0);
  const totalPublished = sites.reduce((s, x) => s + x.published, 0);
  const totalConnections = sites.reduce((s, x) => s + x.connections, 0);

  return (
    <div className="p-4 space-y-4">
      {/* Rollup stats */}
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Sites" value={sites.length} />
        <Stat label="Total Assets" value={totalAssets} />
        <Stat label="Published" value={totalPublished} accent />
        <Stat label="Connections" value={totalConnections} />
      </div>

      {/* Subscriber info */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Subscriber</h3>
          <Row label="Email" value={subscriber.email || "—"} />
          <Row label="Since" value={new Date(subscriber.createdAt).toLocaleDateString()} />
        </div>

        {/* Sites list */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Sites ({sites.length})</h3>
          <div className="space-y-2">
            {sites.map(site => (
              <div key={site.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <div>
                  <p className="text-xs font-medium">{site.name}</p>
                  <p className="text-[10px] text-muted">{site.customDomain || site.url || "No domain"}</p>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <span>{site.assets} assets</span>
                  <span className="text-success">{site.published} published</span>
                  <span className={`rounded px-1.5 py-0.5 ${
                    site.status === "complete" ? "bg-success/10 text-success"
                    : site.status === "in_progress" ? "bg-accent/10 text-accent"
                    : "bg-muted/10 text-muted"
                  }`}>{site.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ManageDashboard() {
  const { subscriberId, siteId } = useManageContext();

  if (subscriberId === "all") return <PlatformDashboard />;
  if (siteId === "all") return <SubscriberOverview subscriberId={subscriberId} />;

  return <SiteOverviewContent siteId={siteId} />;
}

interface DashboardData {
  subscribers: { total: number; active: number; cancelled: number; onboarding: number };
  content: { total_sites: number; total_assets: number; published_articles: number; articles_this_week: number; published_posts: number; autopilot_sites: number };
  health: { active_connections: number; expiring_tokens: number; pending_gbp: number; pending_provisioning: number };
  recentArticles: Array<{ title: string; published_at: string; site_name: string }>;
  attentionSites: Array<{ id: string; name: string; subscriber_name: string; provisioning_status: string; autopilot_enabled: boolean; assets: number; published: number }>;
}

function PlatformDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/manage/dashboard")
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!data) return null;

  const { subscribers, content, health } = data;

  return (
    <div className="p-4 space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-4 gap-3">
        <Stat label="Subscribers" value={subscribers.active} sub={`${subscribers.total} total`} />
        <Stat label="Sites" value={content.total_sites} sub={`${content.autopilot_sites} on autopilot`} accent />
        <Stat label="Published Articles" value={content.published_articles} sub={`${content.articles_this_week} this week`} accent />
        <Stat label="Total Assets" value={content.total_assets} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Platform health */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Platform Health</h3>
          <div className="space-y-2">
            <HealthRow
              label="Active Connections"
              value={health.active_connections}
              status="good"
            />
            <HealthRow
              label="Expiring Tokens"
              value={health.expiring_tokens}
              status={health.expiring_tokens > 0 ? "warning" : "good"}
            />
            <HealthRow
              label="Pending Provisioning"
              value={health.pending_provisioning}
              status={health.pending_provisioning > 0 ? "action" : "good"}
            />
            <HealthRow
              label="Pending GBP Assignment"
              value={health.pending_gbp}
              status={health.pending_gbp > 0 ? "action" : "good"}
            />
            <HealthRow
              label="Autopilot Coverage"
              value={content.total_sites > 0 ? `${Math.round((content.autopilot_sites / content.total_sites) * 100)}%` : "—"}
              status={content.autopilot_sites === content.total_sites ? "good" : "warning"}
            />
          </div>
        </div>

        {/* Needs attention */}
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Needs Attention</h3>
          {data.attentionSites.length > 0 ? (
            <div className="space-y-1.5">
              {data.attentionSites.map(site => (
                <div key={site.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div>
                    <p className="text-xs font-medium">{site.name}</p>
                    <p className="text-[10px] text-muted">{site.subscriber_name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {site.provisioning_status !== "complete" && (
                      <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[9px] text-warning">{site.provisioning_status}</span>
                    )}
                    {!site.autopilot_enabled && (
                      <span className="rounded bg-muted/10 px-1.5 py-0.5 text-[9px] text-muted">No autopilot</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-muted">All sites healthy — nothing needs attention.</p>
          )}
        </div>
      </div>

      {/* Recent articles */}
      {data.recentArticles.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="text-sm font-medium mb-3">Recently Published</h3>
          <div className="space-y-1.5">
            {data.recentArticles.map((article, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <div className="min-w-0 flex-1">
                  <p className="text-xs truncate">{article.title as string}</p>
                  <p className="text-[10px] text-muted">{article.site_name as string}</p>
                </div>
                <span className="text-[10px] text-muted shrink-0 ml-3">
                  {article.published_at ? new Date(article.published_at as string).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HealthRow({ label, value, status }: { label: string; value: string | number; status: "good" | "warning" | "action" }) {
  const dotColor = status === "good" ? "bg-success" : status === "warning" ? "bg-warning" : "bg-accent";
  return (
    <div className="flex items-center justify-between py-1 border-b border-border last:border-0">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span className="text-xs">{label}</span>
      </div>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}
