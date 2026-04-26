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
  assignments: Array<{ site_id: string; site_name: string; is_primary: boolean }>;
}

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
      const assigned = asset.assignments.find(a => a.site_id === siteId && a.is_primary);
      if (assigned) return asset;
    }
    return undefined;
  }

  async function assignAsset(platformAssetId: string, platform: string) {
    setSaving(platform);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/platform-assets/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, platform_asset_id: platformAssetId, is_primary: true }),
      });
      const d = await res.json();
      if (d.success) {
        setMessage(`Assigned ${platform}`);
        load();
      } else {
        setMessage(d.error || "Failed");
      }
    } catch {
      setMessage("Request failed");
    }
    setSaving(null);
  }

  async function unassignAsset(platformAssetId: string, platform: string) {
    setSaving(platform);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/platform-assets/assign", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, platform_asset_id: platformAssetId }),
      });
      const d = await res.json();
      if (d.success) {
        setMessage(`Unassigned ${platform}`);
        load();
      }
    } catch {
      setMessage("Request failed");
    }
    setSaving(null);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const allPlatforms = ["facebook", "instagram", "gbp", "linkedin", "youtube", "tiktok", "twitter", "pinterest"];

  return (
    <div className="p-4 space-y-4">
      {message && (
        <div className="rounded-lg bg-success/10 px-4 py-2 text-xs text-success">{message}</div>
      )}

      <p className="text-xs text-muted">
        Each row shows a platform connection and which asset is assigned to this site.
        OAuth connections are managed in the tenant studio. Assignments are operator-controlled here.
      </p>

      <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-surface-hover">
            <tr className="text-left">
              <th className="px-4 py-2 font-medium text-muted">Platform</th>
              <th className="px-4 py-2 font-medium text-muted">Status</th>
              <th className="px-4 py-2 font-medium text-muted">Assigned Asset</th>
              <th className="px-4 py-2 font-medium text-muted text-right">Actions</th>
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
                    ) : (
                      <select
                        value={primary?.id || ""}
                        onChange={(e) => {
                          if (e.target.value) assignAsset(e.target.value, platform);
                        }}
                        disabled={saving === platform}
                        className="rounded border border-border bg-background px-2 py-1 text-xs min-w-[200px]"
                      >
                        <option value="">— Pending assignment —</option>
                        {assets.map(asset => {
                          const otherSites = asset.assignments
                            .filter(a => a.site_id !== siteId && a.is_primary)
                            .map(a => a.site_name);
                          const label = otherSites.length > 0
                            ? `${asset.asset_name}  [→ ${otherSites.join(", ")}]`
                            : asset.asset_name;
                          return (
                            <option key={asset.id} value={asset.id}>
                              {label}
                            </option>
                          );
                        })}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {primary && (
                      <button
                        onClick={() => unassignAsset(primary.id, platform)}
                        disabled={saving === platform}
                        className="text-[11px] text-muted hover:text-danger disabled:opacity-50"
                      >
                        Unassign
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-muted">
        Tip: brackets next to an asset name show which other sites currently use it.
        You can assign the same asset to multiple sites if intended.
      </p>
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
