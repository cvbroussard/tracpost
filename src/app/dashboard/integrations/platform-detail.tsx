"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PlatformIcon } from "@/components/platform-icons";
import type { PlatformConfig } from "./platform-config";

interface AvailableAsset {
  id: string;
  assetId: string;
  assetName: string;
  connectedUserName: string | null;
  tokenExpiresAt: string | null;
}

interface ConnectionStatus {
  connected: boolean;
  accountId: string | null;
  accountName: string | null;
  connectedUserName?: string | null;
  socialAccountId?: string | null;
  status: string | null;
  tokenExpiresAt: string | null;
  published: number;
  scheduled: number;
  availableAssets?: number;
  availableAssetList?: AvailableAsset[];
}

function usePrefix() {
  const isSubdomain = typeof window !== "undefined" && window.location.hostname === "studio.tracpost.com";
  return isSubdomain ? "" : "/dashboard";
}

export function PlatformDetail({
  platform,
  siteId,
}: {
  platform: PlatformConfig;
  siteId: string;
}) {
  const prefix = usePrefix();
  const [conn, setConn] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/accounts/platform-status?site_id=${siteId}&platform=${platform.key}`)
      .then(r => r.ok ? r.json() : { connected: false })
      .then(d => setConn(d))
      .finally(() => setLoading(false));
  }, [siteId, platform.key]);

  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [showSwitch, setShowSwitch] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [disconnectMessage, setDisconnectMessage] = useState("");

  async function handleDisconnect() {
    const socialAccountId = conn?.socialAccountId || conn?.accountId;
    if (!socialAccountId) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`/api/social-accounts/${socialAccountId}`, { method: "DELETE" });
      const result = res.ok ? await res.json() : null;
      if (result?.cancelledScheduledCount > 0) {
        setDisconnectMessage(
          `Disconnected. Cancelled ${result.cancelledScheduledCount} scheduled post${result.cancelledScheduledCount === 1 ? "" : "s"}.`,
        );
      } else {
        setDisconnectMessage("Disconnected.");
      }
      // Reload status
      const statusRes = await fetch(`/api/accounts/platform-status?site_id=${siteId}&platform=${platform.key}`);
      const data = statusRes.ok ? await statusRes.json() : { connected: false };
      setConn(data);
      setConfirmDisconnect(false);
    } finally {
      setDisconnecting(false);
    }
  }

  async function handleAssignAsset(platformAssetId: string) {
    setAssigning(true);
    setError("");
    try {
      const res = await fetch("/api/accounts/assign-asset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ site_id: siteId, platform_asset_id: platformAssetId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to bind asset");
        return;
      }
      // Reload status to flip to connected state
      const statusRes = await fetch(`/api/accounts/platform-status?site_id=${siteId}&platform=${platform.key}`);
      const data = statusRes.ok ? await statusRes.json() : { connected: false };
      setConn(data);
      setShowSwitch(false);
      setDisconnectMessage("");
    } finally {
      setAssigning(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setError("");
    try {
      const res = await fetch(`${platform.oauthRoute}?site_id=${siteId}`);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to start connection");
        setConnecting(false);
        return;
      }
      const { auth_url } = await res.json();
      window.location.href = auth_url;
    } catch {
      setError("Network error");
      setConnecting(false);
    }
  }

  const tokenExpires = conn?.tokenExpiresAt ? new Date(conn.tokenExpiresAt) : null;
  const daysLeft = tokenExpires ? Math.ceil((tokenExpires.getTime() - Date.now()) / 86400000) : null;
  const tokenUrgent = daysLeft !== null && daysLeft < 7;

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link href={prefix + "/integrations"} className="hover:text-foreground">Integrations</Link>
        <span>/</span>
        <span className="text-foreground">{platform.label}</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg border border-border bg-surface">
          <PlatformIcon platform={platform.key} size={22} />
        </div>
        <div>
          <h1 className="text-lg font-semibold">{platform.label}</h1>
          <p className="text-xs text-muted">{platform.accountType}</p>
        </div>
        {!loading && conn && (
          <span className={`ml-auto rounded px-2.5 py-1 text-xs font-medium ${
            conn.connected
              ? "bg-success/10 text-success"
              : conn.status === "pending_assignment"
              ? "bg-warning/10 text-warning"
              : "bg-surface-hover text-muted"
          }`}>
            {conn.connected
              ? "Connected"
              : conn.status === "pending_assignment"
              ? "Choose a Page"
              : "Not connected"}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-4">
          {/* Why this platform */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-2">Why {platform.label}</h3>
            <p className="text-xs text-muted leading-relaxed">{platform.why}</p>
          </div>

          {/* What we do with it */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-2">What TracPost does</h3>
            <ul className="space-y-1.5">
              {platform.whatWeDoWithIt.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted">
                  <span className="text-success mt-0.5 shrink-0">✓</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Help links */}
          {platform.helpLinks.length > 0 && (
            <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
              <h3 className="text-sm font-medium mb-2">Resources</h3>
              <div className="space-y-1.5">
                {platform.helpLinks.map((link, i) => (
                  <a
                    key={i}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs text-accent hover:underline"
                  >
                    <span>→</span>
                    <span>{link.label}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Prerequisites */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-2">Before you connect</h3>
            <ol className="space-y-2">
              {platform.prerequisites.map((prereq, i) => (
                <li key={i} className="flex items-start gap-2.5 text-xs text-muted">
                  <span className="flex items-center justify-center w-4 h-4 rounded-full bg-surface-hover text-[9px] font-medium shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span>{prereq}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Connection status */}
          <div className={`rounded-xl border p-4 shadow-card transition-colors ${
            conn?.status === "pending_assignment"
              ? "border-warning/40 bg-warning/5"
              : "border-border bg-surface"
          }`}>
            <h3 className={`text-sm font-semibold mb-3 ${
              conn?.status === "pending_assignment" ? "text-warning" : "font-medium"
            }`}>
              {conn?.status === "pending_assignment"
                ? `Choose your ${platform.label} Page`
                : "Connection"}
            </h3>
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            ) : conn?.connected ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1.5 border-b border-border">
                  <span className="text-[10px] text-muted">Connected Page</span>
                  <span className="text-xs font-medium">{conn.accountName || "—"}</span>
                </div>
                {conn.connectedUserName && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border">
                    <span className="text-[10px] text-muted">Connected as</span>
                    <span className="text-xs font-medium">{conn.connectedUserName}</span>
                  </div>
                )}
                <div className="flex items-center justify-between py-1.5 border-b border-border">
                  <span className="text-[10px] text-muted">Status</span>
                  <span className={`text-xs font-medium ${
                    conn.status === "active" || conn.status === "connected"
                      ? "text-success"
                      : "text-danger"
                  }`}>
                    {conn.status}
                  </span>
                </div>
                {tokenExpires && (
                  <div className="flex items-center justify-between py-1.5 border-b border-border">
                    <span className="text-[10px] text-muted">Token expires</span>
                    <span className={`text-xs font-medium ${tokenUrgent ? "text-danger" : ""}`}>
                      {daysLeft !== null ? `${daysLeft} days` : "—"}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between py-1.5 border-b border-border">
                  <span className="text-[10px] text-muted">Published</span>
                  <span className="text-xs font-medium">{conn.published}</span>
                </div>
                <div className="flex items-center justify-between py-1.5">
                  <span className="text-[10px] text-muted">Scheduled</span>
                  <span className="text-xs font-medium">{conn.scheduled}</span>
                </div>

                {platform.multiAssetWarning && (
                  <div className="mt-3 rounded-md border border-warning/30 bg-warning/5 p-3">
                    <p className="text-[10px] font-semibold text-warning uppercase tracking-wider mb-1">Connection note</p>
                    <p className="text-xs text-foreground leading-relaxed">{platform.multiAssetWarning}</p>
                  </div>
                )}
                {showSwitch && conn.availableAssetList && conn.availableAssetList.length > 0 ? (
                  <div className="mt-3 rounded-md border border-accent/30 bg-accent/5 p-3 space-y-2">
                    <p className="text-[10px] font-semibold text-accent uppercase tracking-wider mb-1">Switch connected Page</p>
                    <p className="text-xs text-muted leading-relaxed">
                      Pick a different Page for this business. The current binding will be replaced. (One business = one Page.)
                    </p>
                    {conn.availableAssetList.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => handleAssignAsset(a.id)}
                        disabled={assigning || a.id === conn.accountId}
                        className="w-full text-left rounded border border-border bg-surface px-3 py-2 text-xs hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="font-medium">{a.assetName}</div>
                        {a.connectedUserName && (
                          <div className="text-[10px] text-muted mt-0.5">via {a.connectedUserName}</div>
                        )}
                        {a.id === conn.accountId && (
                          <div className="text-[10px] text-success mt-0.5">currently connected</div>
                        )}
                      </button>
                    ))}
                    <button
                      onClick={() => setShowSwitch(false)}
                      className="w-full rounded border border-border px-3 py-1.5 text-[10px] text-muted hover:bg-surface-hover"
                    >
                      Cancel
                    </button>
                  </div>
                ) : null}
                <div className="pt-3 mt-2 border-t border-border flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleConnect}
                    disabled={connecting || disconnecting}
                    className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover disabled:opacity-50"
                    title="Re-run OAuth to refresh the access token while keeping this Page bound to this site."
                  >
                    {connecting ? "Refreshing..." : "Refresh token"}
                  </button>
                  {(conn.availableAssetList?.length ?? 0) > 1 && (
                    <button
                      onClick={() => setShowSwitch(!showSwitch)}
                      disabled={connecting || disconnecting}
                      className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover disabled:opacity-50"
                      title="Bind a different Page to this site without re-running OAuth."
                    >
                      Switch Page
                    </button>
                  )}
                  {confirmDisconnect ? (
                    <div className="basis-full mt-2 rounded-md border border-danger/30 bg-danger/5 p-3">
                      <p className="text-xs font-semibold text-danger mb-1">Disconnect this Page?</p>
                      <p className="text-[11px] text-foreground leading-relaxed mb-2">
                        Disconnecting will:
                      </p>
                      <ul className="text-[11px] text-foreground leading-relaxed mb-3 space-y-0.5 ml-4 list-disc">
                        <li>Revoke TracPost&apos;s access on Meta&apos;s side</li>
                        <li>Cancel any posts scheduled on this Page</li>
                        <li>Stop new comments from syncing to your inbox</li>
                        <li>Keep your published posts and historical analytics</li>
                      </ul>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleDisconnect}
                          disabled={disconnecting}
                          className="rounded border border-danger/30 bg-danger/10 px-3 py-1 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
                        >
                          {disconnecting ? "Disconnecting..." : "Yes, disconnect"}
                        </button>
                        <button
                          onClick={() => setConfirmDisconnect(false)}
                          disabled={disconnecting}
                          className="rounded border border-border px-3 py-1 text-xs text-muted hover:bg-surface-hover"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDisconnect(true)}
                      disabled={connecting || disconnecting}
                      className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-danger hover:border-danger/30 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            ) : conn?.status === "pending_assignment" && conn.availableAssetList && conn.availableAssetList.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-foreground leading-relaxed">
                  You granted access to <span className="font-semibold">{conn.availableAssets} {platform.label} {(conn.availableAssets ?? 0) === 1 ? "Page" : "Pages"}</span>.
                  Pick the one for this business — TracPost will bind it to this site.
                  <span className="block mt-1 text-[11px] text-muted">One business = one Page. You can switch later if needed.</span>
                </p>
                <div className="space-y-2">
                  {conn.availableAssetList.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => handleAssignAsset(a.id)}
                      disabled={assigning || disconnecting}
                      className="group w-full text-left rounded-md border-2 border-border bg-surface px-3 py-3 text-xs transition-all hover:border-accent hover:bg-accent/5 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold text-sm text-foreground">{a.assetName}</div>
                          {a.connectedUserName && (
                            <div className="text-[10px] text-muted mt-0.5">via {a.connectedUserName}</div>
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-muted group-hover:text-accent transition-colors">
                          {assigning ? "..." : "Pick →"}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                {error && (
                  <p className="text-xs text-danger">{error}</p>
                )}
                <div className="pt-3 mt-2 border-t border-warning/30">
                  {confirmDisconnect ? (
                    <div className="rounded-md border border-danger/30 bg-danger/5 p-3">
                      <p className="text-xs font-semibold text-danger mb-1">Disconnect without picking a Page?</p>
                      <p className="text-[11px] text-foreground leading-relaxed mb-2">
                        Disconnecting will:
                      </p>
                      <ul className="text-[11px] text-foreground leading-relaxed mb-3 space-y-0.5 ml-4 list-disc">
                        <li>Revoke TracPost&apos;s access on Meta&apos;s side</li>
                        <li>Remove the granted Pages from TracPost (no Page will be bound)</li>
                        <li>You can reconnect anytime to start over</li>
                      </ul>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleDisconnect}
                          disabled={disconnecting}
                          className="rounded border border-danger/30 bg-danger/10 px-3 py-1 text-xs font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
                        >
                          {disconnecting ? "Disconnecting..." : "Yes, disconnect"}
                        </button>
                        <button
                          onClick={() => setConfirmDisconnect(false)}
                          disabled={disconnecting}
                          className="rounded border border-border px-3 py-1 text-xs text-muted hover:bg-surface-hover"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDisconnect(true)}
                      disabled={assigning || disconnecting}
                      className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-danger hover:border-danger/30 disabled:opacity-50"
                    >
                      Disconnect
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {disconnectMessage && (
                  <div className="rounded-md border border-success/30 bg-success/5 p-3">
                    <p className="text-xs text-success font-medium">{disconnectMessage}</p>
                  </div>
                )}
                <p className="text-xs text-muted">
                  {platform.oauthReady
                    ? "Ready to connect. Make sure you've completed the prerequisites above, then click the button below."
                    : "This platform connection is coming soon. We'll notify you when it's available."
                  }
                </p>
                {platform.oauthReady && platform.multiAssetWarning && (
                  <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
                    <p className="text-[10px] font-semibold text-warning uppercase tracking-wider mb-1">Important</p>
                    <p className="text-xs text-foreground leading-relaxed">{platform.multiAssetWarning}</p>
                  </div>
                )}
                <button
                  onClick={handleConnect}
                  disabled={connecting || !platform.oauthReady}
                  className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                >
                  {connecting
                    ? "Connecting..."
                    : !platform.oauthReady
                    ? "Coming Soon"
                    : `Connect ${platform.label}`
                  }
                </button>
                {error && (
                  <p className="text-xs text-danger">{error}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
