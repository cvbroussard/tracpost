"use client";

import { useState, useEffect, useCallback } from "react";
import { ManagePage } from "@/components/manage/manage-page";

interface Asset {
  id: string;
  social_account_id: string;
  platform: string;
  asset_type: string;
  asset_id: string;
  asset_name: string;
  metadata: Record<string, unknown>;
  health_status: string;
  health_checked_at: string | null;
  health_error: string | null;
  assignments: Array<{ business_id: string; site_name: string; is_primary: boolean }>;
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

interface OAuthAccount {
  social_account_id: string;
  platform: string;
  user_name: string;
  status: string;
  token_expires_at: string | null;
}

interface ConnectionsData {
  accounts: OAuthAccount[];
  assets: Asset[];
}

const PLATFORM_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  gbp: "Google Business Profile",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  twitter: "X (Twitter)",
  pinterest: "Pinterest",
};

function ConnectionsContent({ siteId, subscriberId }: { siteId: string; subscriberId: string }) {
  const [data, setData] = useState<ConnectionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`/api/admin/platform-assets?subscription_id=${subscriberId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false));
  }, [subscriberId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  const assetsByPlatform: Record<string, Asset[]> = {};
  for (const asset of data?.assets || []) {
    if (!assetsByPlatform[asset.platform]) assetsByPlatform[asset.platform] = [];
    assetsByPlatform[asset.platform].push(asset);
  }

  const platformsWithAuth = new Set<string>();
  const hasMetaGrant = data?.accounts?.some(a => a.platform === "meta") || false;
  if (hasMetaGrant) {
    platformsWithAuth.add("facebook");
    platformsWithAuth.add("instagram");
  }
  for (const acct of data?.accounts || []) {
    if (acct.platform !== "meta") platformsWithAuth.add(acct.platform);
  }
  for (const platform of Object.keys(assetsByPlatform)) {
    platformsWithAuth.add(platform);
  }

  function getSitePrimary(platform: string): Asset | undefined {
    const assets = assetsByPlatform[platform] || [];
    for (const asset of assets) {
      const assigned = asset.assignments.find(a => a.business_id === siteId && a.is_primary);
      if (assigned) return asset;
    }
    return undefined;
  }

  // Asset assignment is tenant authority — performed inside the studio's
  // OAuth connector flow. Operator-side picker + unassign retired
  // 2026-06-13 to honor the role-split (operator observes; tenant writes).

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const allPlatforms = ["facebook", "instagram", "gbp", "linkedin", "youtube", "tiktok", "twitter", "pinterest"];

  async function runHealthCheck() {
    setSaving("__health__");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/asset-health", { method: "POST" });
      const d = await res.json();
      const summary = d.summary || {};
      const total = Object.values(summary).reduce((n: number, v) => n + (v as number), 0);
      setMessage(`Health check complete — ${total} assets checked across all subscribers`);
      load();
    } catch {
      setMessage("Health check failed");
    }
    setSaving(null);
  }

  return (
    <div className="p-4 space-y-4">
      {message && (
        <div className="rounded-lg bg-success/10 px-4 py-2 text-xs text-success">{message}</div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted flex-1 pr-4">
          Each row shows a platform connection and which asset is assigned to this site.
          OAuth connections and asset assignment are managed by the tenant in the studio;
          this page is observation only.
        </p>
        <button
          onClick={runHealthCheck}
          disabled={saving === "__health__"}
          className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover disabled:opacity-50 shrink-0"
        >
          {saving === "__health__" ? "Checking..." : "Run Health Check"}
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-surface-hover">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium text-muted">Platform</th>
              <th className="px-4 py-2 font-medium text-muted">Status</th>
              <th className="px-4 py-2 font-medium text-muted">Assigned Asset</th>
              <th className="px-4 py-2 font-medium text-muted">Health</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {allPlatforms.map(platform => {
              const assets = assetsByPlatform[platform] || [];
              const hasAuth = platformsWithAuth.has(platform);
              const primary = getSitePrimary(platform);

              return (
                <tr key={platform}>
                  <td className="px-4 py-3 font-medium">{PLATFORM_LABELS[platform]}</td>
                  <td className="px-4 py-3">
                    {hasAuth ? (
                      <span className="text-success">✓ Connected</span>
                    ) : (
                      <span className="text-muted">Not connected</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!hasAuth ? (
                      <span className="text-muted text-[11px]">Connect from Studio first</span>
                    ) : assets.length === 0 ? (
                      <span className="text-warning text-[11px]">Connected (legacy) — reconnect to migrate</span>
                    ) : primary ? (
                      <span className="text-xs">{primary.asset_name}</span>
                    ) : (
                      <span className="text-muted text-[11px]">Pending tenant assignment</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {primary ? (
                      <span
                        title={primary.health_error || (primary.health_checked_at ? `Checked ${new Date(primary.health_checked_at).toLocaleString()}` : "")}
                        className={`inline-block rounded px-2 py-0.5 text-[10px] font-medium ${HEALTH_COLOR[primary.health_status] || HEALTH_COLOR.unknown}`}
                      >
                        {HEALTH_LABEL[primary.health_status] || primary.health_status}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Site Connections" requireSite>
      {({ siteId, subscriberId }) => <ConnectionsContent siteId={siteId} subscriberId={subscriberId} />}
    </ManagePage>
  );
}
