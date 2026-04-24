"use client";

import Link from "next/link";
import { PlatformIcon } from "@/components/platform-icons";
import { PLATFORMS } from "./platform-config";

interface ConnectedInfo {
  accountName: string;
  status: string;
  tokenExpiresAt: string | null;
}

function usePrefix() {
  const isSubdomain = typeof window !== "undefined" && window.location.hostname === "studio.tracpost.com";
  return isSubdomain ? "" : "/dashboard";
}

export function ConnectionsOverview({
  connected,
}: {
  connected: Record<string, ConnectedInfo>;
}) {
  const prefix = usePrefix();
  const connectedCount = Object.keys(connected).length;

  return (
    <div className="p-4 space-y-6">
      <div>
        <h1 className="text-lg font-semibold mb-1">Connections</h1>
        <p className="text-sm text-muted">
          {connectedCount} of {PLATFORMS.length} platforms connected
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {PLATFORMS.map((platform) => {
          const conn = connected[platform.key];
          const isConnected = !!conn;
          const tokenExpires = conn?.tokenExpiresAt ? new Date(conn.tokenExpiresAt) : null;
          const daysLeft = tokenExpires ? Math.ceil((tokenExpires.getTime() - Date.now()) / 86400000) : null;
          const tokenUrgent = daysLeft !== null && daysLeft < 7;

          return (
            <Link
              key={platform.key}
              href={`${prefix}/accounts/${platform.slug}`}
              className="group rounded-xl border border-border bg-surface p-4 shadow-card transition-colors hover:border-accent/30"
            >
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg border border-border bg-background shrink-0">
                  <PlatformIcon platform={platform.key} size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">{platform.label}</h3>
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                      isConnected
                        ? conn.status === "active" ? "bg-success" : "bg-warning"
                        : "bg-border"
                    }`} />
                  </div>
                  {isConnected ? (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-[10px] text-success truncate">{conn.accountName}</p>
                      {tokenUrgent && (
                        <p className="text-[10px] text-danger">Token expires in {daysLeft}d</p>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] text-muted">
                      {platform.oauthReady ? "Not connected" : "Coming soon"}
                    </p>
                  )}
                </div>
              </div>
              <p className="mt-3 text-[10px] text-muted leading-relaxed line-clamp-2">
                {platform.why.split(".")[0]}.
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
