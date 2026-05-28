"use client";

import { useState, useEffect, useCallback } from "react";
import { ManagePage } from "@/components/manage/manage-page";

interface SiteStatus {
  gbp: {
    connected: boolean;
    tokenOk: boolean;
    dirty: boolean;
    dirtyFields: string[];
    pendingReplies: number;
    photosSynced: number;
    gscVerified: boolean;
  };
  seo: {
    pagesScored: number;
    searchRows: number;
    customDomain: string | null;
    gscProperty: string | null;
  };
  content: {
    hasPlaybook: boolean;
    totalAssets: number;
    totalPosts: number;
    autopilotEnabled: boolean;
  };
}

function ActionRow({
  label,
  description,
  status,
  statusOk,
  buttonLabel,
  onClick,
  acting,
  disabled,
}: {
  label: string;
  description: string;
  status: string;
  statusOk: boolean;
  buttonLabel: string;
  onClick: () => void;
  acting: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border last:border-0">
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusOk ? "bg-success" : "bg-warning"}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-[10px] text-muted">{description}</p>
      </div>
      <span className={`text-[10px] shrink-0 ${statusOk ? "text-success" : "text-muted"}`}>{status}</span>
      <button
        onClick={onClick}
        disabled={acting || disabled}
        className="shrink-0 rounded border border-border px-3 py-1 text-[10px] font-medium text-muted hover:text-foreground hover:bg-surface-hover disabled:opacity-50"
      >
        {acting ? "..." : buttonLabel}
      </button>
    </div>
  );
}

interface AssignedAssetHealth {
  platform: string;
  asset_name: string;
  health_status: string;
  health_checked_at: string | null;
  health_error: string | null;
}

const HEALTH_LABEL: Record<string, string> = {
  healthy: "Healthy",
  permission_lost: "Permission lost",
  token_expired: "Token expired",
  unreachable: "Unreachable",
  unknown: "Not yet checked",
};

const HEALTH_COLOR: Record<string, string> = {
  healthy: "text-success bg-success/10",
  permission_lost: "text-warning bg-warning/10",
  token_expired: "text-danger bg-danger/10",
  unreachable: "text-danger bg-danger/10",
  unknown: "text-muted bg-surface-hover",
};

const PLATFORM_DISPLAY: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  gbp: "Google Business Profile",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  twitter: "X (Twitter)",
  pinterest: "Pinterest",
};

function ConnectionHealth({ siteId, subscriberId }: { siteId: string; subscriberId: string }) {
  const [assigned, setAssigned] = useState<AssignedAssetHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/admin/platform-assets?subscription_id=${subscriberId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d?.assets) return;
        // Filter to assets assigned to this site as primary
        const rows: AssignedAssetHealth[] = [];
        for (const asset of d.assets) {
          const isPrimaryHere = asset.assignments?.find(
            (a: { business_id: string; is_primary: boolean }) => a.business_id === siteId && a.is_primary
          );
          if (isPrimaryHere) {
            rows.push({
              platform: asset.platform,
              asset_name: asset.asset_name,
              health_status: asset.health_status || "unknown",
              health_checked_at: asset.health_checked_at,
              health_error: asset.health_error,
            });
          }
        }
        setAssigned(rows);
      })
      .finally(() => setLoading(false));
  }, [siteId, subscriberId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function runCheck() {
    setChecking(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/asset-health", { method: "POST" });
      const d = await res.json();
      const total = Object.values(d.summary || {}).reduce((n: number, v) => n + (v as number), 0);
      setMessage(`Checked ${total} assets`);
      load();
    } catch {
      setMessage("Check failed");
    }
    setChecking(false);
  }

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : assigned.length === 0 ? (
        <p className="text-[11px] text-muted">No assets assigned to this site yet. Configure in Site Settings → Connections.</p>
      ) : (
        <div>
          {assigned.map(a => (
            <div key={a.platform} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
              <span className="text-xs font-medium w-48 shrink-0">{PLATFORM_DISPLAY[a.platform] || a.platform}</span>
              <span className="text-[11px] text-muted flex-1 truncate">{a.asset_name}</span>
              <span
                title={a.health_error || (a.health_checked_at ? `Checked ${new Date(a.health_checked_at).toLocaleString()}` : "")}
                className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium shrink-0 ${HEALTH_COLOR[a.health_status] || HEALTH_COLOR.unknown}`}
              >
                {HEALTH_LABEL[a.health_status] || a.health_status}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={runCheck}
          disabled={checking}
          className="rounded border border-border px-3 py-1 text-[10px] font-medium text-muted hover:text-foreground hover:bg-surface-hover disabled:opacity-50"
        >
          {checking ? "Checking..." : "Run Health Check"}
        </button>
        {message && <span className="text-[10px] text-success">{message}</span>}
      </div>
    </div>
  );
}

function TestPublish({ siteId }: { siteId: string }) {
  const [platform, setPlatform] = useState("facebook");
  const [running, setRunning] = useState(false);
  const [response, setResponse] = useState<unknown>(null);

  async function run() {
    setRunning(true);
    setResponse(null);
    try {
      const res = await fetch(`/api/admin/sites/${siteId}/autopilot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", platform }),
      });
      const data = await res.json();
      setResponse({ httpStatus: res.status, ...data });
    } catch (err) {
      setResponse({ error: err instanceof Error ? err.message : "Request failed" });
    }
    setRunning(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          disabled={running}
          className="rounded border border-border bg-background px-2 py-1 text-xs"
        >
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
          <option value="linkedin">LinkedIn</option>
          <option value="twitter">X (Twitter)</option>
          <option value="tiktok">TikTok</option>
          <option value="youtube">YouTube</option>
          <option value="pinterest">Pinterest</option>
          <option value="gbp">Google Business Profile</option>
        </select>
        <button
          onClick={run}
          disabled={running}
          className="rounded bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {running ? "Publishing..." : "Trigger Publish"}
        </button>
      </div>
      {response !== null && (
        <pre className="rounded border border-border bg-background p-3 text-[10px] text-foreground overflow-x-auto whitespace-pre-wrap break-all">
{JSON.stringify(response, null, 2)}
        </pre>
      )}
    </div>
  );
}

function SiteActionsContent({ siteId, subscriberId }: { siteId: string; subscriberId: string }) {
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetch(`/api/manage/site-actions?site_id=${siteId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setStatus(d))
      .finally(() => setLoading(false));
  }, [siteId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function act(key: string, endpoint: string, body: Record<string, unknown>) {
    setActing(key);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      setResults(prev => ({ ...prev, [key]: d.success !== false ? "Done" : (d.error || "Failed") }));
      load();
    } catch {
      setResults(prev => ({ ...prev, [key]: "Failed" }));
    }
    setActing(null);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!status) return <p className="p-6 text-xs text-muted">Failed to load site status.</p>;

  const s = status;

  return (
    <div className="p-4 space-y-4">
      {Object.keys(results).length > 0 && (
        <div className="rounded-lg bg-success/10 px-4 py-2 text-xs text-success">
          {Object.entries(results).map(([k, v]) => (
            <span key={k} className="mr-4">{k}: {v}</span>
          ))}
        </div>
      )}

      {/* GBP */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-1">Google Business Profile</h3>
        <p className="text-[10px] text-muted mb-3">Connection, sync, and publishing actions</p>
        <div>
          <ActionRow
            label="Push to Google"
            description="Publish dirty fields to GBP listing"
            status={s.gbp.dirty ? `Dirty: ${s.gbp.dirtyFields.join(", ")}` : "In sync"}
            statusOk={!s.gbp.dirty}
            buttonLabel="Push"
            onClick={() => act("Push to Google", `/api/admin/sites/${siteId}/autopilot`, { action: "publish", platform: "gbp" })}
            acting={acting === "Push to Google"}
            disabled={!s.gbp.dirty}
          />
          <ActionRow
            label="Sync Photos"
            description="Pull latest photos from media library to GBP"
            status={`${s.gbp.photosSynced} synced`}
            statusOk={s.gbp.photosSynced > 0}
            buttonLabel="Sync"
            onClick={() => act("Sync Photos", `/api/admin/sites/${siteId}/photos`, { action: "sync_blue_ribbon" })}
            acting={acting === "Sync Photos"}
          />
          <ActionRow
            label="Sync Reviews"
            description="Pull reviews and auto-draft AI replies"
            status={s.gbp.pendingReplies > 0 ? `${s.gbp.pendingReplies} pending` : "Up to date"}
            statusOk={s.gbp.pendingReplies === 0}
            buttonLabel="Sync"
            onClick={() => act("Sync Reviews", `/api/admin/sites/${siteId}/reviews`, {})}
            acting={acting === "Sync Reviews"}
          />
          <ActionRow
            label="Regenerate Categories"
            description="Re-run service category classification"
            status=""
            statusOk={true}
            buttonLabel="Regenerate"
            onClick={() => act("Regenerate Categories", `/api/admin/sites/${siteId}/services/regenerate`, { step: "categorize" })}
            acting={acting === "Regenerate Categories"}
          />
          <ActionRow
            label="Refresh Token"
            description="Refresh expired Google OAuth token"
            status={s.gbp.tokenOk ? "Active" : "Expired"}
            statusOk={s.gbp.tokenOk}
            buttonLabel="Refresh"
            onClick={() => act("Refresh Token", `/api/admin/sites/${siteId}/autopilot`, { action: "refresh_tokens" })}
            acting={acting === "Refresh Token"}
            disabled={s.gbp.tokenOk}
          />
        </div>
      </div>

      {/* Connection Health */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-1">Connection Health</h3>
        <p className="text-[10px] text-muted mb-3">Live status for each platform asset assigned to this site. Hover the badge for details.</p>
        <ConnectionHealth siteId={siteId} subscriberId={subscriberId} />
      </div>

      {/* Test Publishing */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-1">Test Publishing</h3>
        <p className="text-[10px] text-muted mb-3">Trigger a single autopilot publish to a specific platform. Useful for verifying connections and debugging.</p>
        <TestPublish siteId={siteId} />
      </div>

      {/* SEO */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-1">SEO & Search Console</h3>
        <p className="text-[10px] text-muted mb-3">Scoring, verification, and search data</p>
        <div>
          <ActionRow
            label="Score All Pages"
            description="Run PageSpeed Insights on all site pages"
            status={`${s.seo.pagesScored} scored`}
            statusOk={s.seo.pagesScored > 0}
            buttonLabel="Score"
            onClick={() => act("Score All Pages", `/api/admin/sites/${siteId}/page-scores`, { action: "score_all" })}
            acting={acting === "Score All Pages"}
          />
          <ActionRow
            label="Verify Search Console"
            description="Request token, inject meta tag, verify with Google"
            status={s.seo.gscProperty ? "Verified" : "Not verified"}
            statusOk={!!s.seo.gscProperty}
            buttonLabel={s.seo.gscProperty ? "Re-verify" : "Verify"}
            onClick={() => act("Verify Search Console", `/api/admin/sites/${siteId}/search-console`, { action: "verify" })}
            acting={acting === "Verify Search Console"}
            disabled={!s.seo.customDomain}
          />
          <ActionRow
            label="Sync Search Data"
            description="Pull last 28 days of query and page performance"
            status={`${s.seo.searchRows} rows`}
            statusOk={s.seo.searchRows > 0}
            buttonLabel="Sync"
            onClick={() => act("Sync Search Data", `/api/admin/sites/${siteId}/search-console`, { action: "sync", days: 28 })}
            acting={acting === "Sync Search Data"}
            disabled={!s.seo.gscProperty}
          />
        </div>
      </div>

      {/* Content */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="text-sm font-medium mb-1">Content & Publishing</h3>
        <p className="text-[10px] text-muted mb-3">Brand playbook, articles, and autopilot</p>
        <div>
          <ActionRow
            label="Generate Brand Playbook"
            description="Build or rebuild the brand voice and content strategy"
            status={s.content.hasPlaybook ? "Generated" : "Not generated"}
            statusOk={s.content.hasPlaybook}
            buttonLabel={s.content.hasPlaybook ? "Regenerate" : "Generate"}
            onClick={() => act("Generate Playbook", `/api/admin/sites/${siteId}/autopilot`, { action: "generate_playbook" })}
            acting={acting === "Generate Playbook"}
          />
          <ActionRow
            label="Write Editorial Article"
            description="Generate a new blog article from the content strategy"
            status={`${s.content.totalPosts} articles`}
            statusOk={s.content.totalPosts > 0}
            buttonLabel="Write"
            onClick={() => act("Write Article", `/api/blog?site_id=${siteId}&action=generate`, {})}
            acting={acting === "Write Article"}
          />
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Site Actions" requireSite>
      {({ siteId, subscriberId }) => <SiteActionsContent siteId={siteId} subscriberId={subscriberId} />}
    </ManagePage>
  );
}
