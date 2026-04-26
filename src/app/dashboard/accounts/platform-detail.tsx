"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PlatformIcon } from "@/components/platform-icons";
import type { PlatformConfig } from "./platform-config";

interface ConnectionStatus {
  connected: boolean;
  accountId: string | null;
  accountName: string | null;
  status: string | null;
  tokenExpiresAt: string | null;
  published: number;
  scheduled: number;
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

  async function handleDisconnect() {
    if (!conn?.accountId) return;
    setDisconnecting(true);
    try {
      await fetch(`/api/social-accounts/${conn.accountId}`, { method: "DELETE" });
      // Reload status
      const res = await fetch(`/api/accounts/platform-status?site_id=${siteId}&platform=${platform.key}`);
      const data = await res.ok ? await res.json() : { connected: false };
      setConn(data);
      setConfirmDisconnect(false);
    } finally {
      setDisconnecting(false);
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
        <Link href={prefix + "/accounts"} className="hover:text-foreground">Connections</Link>
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
              : "bg-surface-hover text-muted"
          }`}>
            {conn.connected ? "Connected" : "Not connected"}
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
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Connection</h3>
            {loading ? (
              <div className="flex justify-center py-4">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              </div>
            ) : conn?.connected ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between py-1.5 border-b border-border">
                  <span className="text-[10px] text-muted">Account</span>
                  <span className="text-xs font-medium">{conn.accountName || "—"}</span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-border">
                  <span className="text-[10px] text-muted">Status</span>
                  <span className={`text-xs font-medium ${conn.status === "active" ? "text-success" : "text-danger"}`}>
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
                    <p className="text-[10px] font-semibold text-warning uppercase tracking-wider mb-1">Reconnect note</p>
                    <p className="text-xs text-foreground leading-relaxed">{platform.multiAssetWarning}</p>
                  </div>
                )}
                <div className="pt-3 mt-2 border-t border-border flex items-center gap-2">
                  <button
                    onClick={handleConnect}
                    disabled={connecting || disconnecting}
                    className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground hover:bg-surface-hover disabled:opacity-50"
                  >
                    {connecting ? "Reconnecting..." : "Reconnect"}
                  </button>
                  {confirmDisconnect ? (
                    <>
                      <span className="text-[10px] text-danger">Disconnect?</span>
                      <button
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                        className="rounded border border-danger/30 px-2 py-1 text-[10px] text-danger hover:bg-danger/10 disabled:opacity-50"
                      >
                        {disconnecting ? "..." : "Yes"}
                      </button>
                      <button
                        onClick={() => setConfirmDisconnect(false)}
                        className="rounded border border-border px-2 py-1 text-[10px] text-muted hover:bg-surface-hover"
                      >
                        No
                      </button>
                    </>
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
            ) : (
              <div className="space-y-3">
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
