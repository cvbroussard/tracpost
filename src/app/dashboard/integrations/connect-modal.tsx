"use client";

import { useState } from "react";
import { PlatformIcon } from "@/components/platform-icons";

interface ConnectButtonProps {
  siteId: string | null;
  connectedPlatforms?: string[];
}

const PLATFORMS = [
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "TikTok" },
  { key: "facebook", label: "Facebook" },
  { key: "gbp", label: "Google Business" },
  { key: "youtube", label: "YouTube" },
  { key: "twitter", label: "X (Twitter)" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "pinterest", label: "Pinterest" },
];

export function ConnectButton({ siteId, connectedPlatforms = [] }: ConnectButtonProps) {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleConnect(platform: string) {
    setConnecting(platform);
    setError("");

    try {
      let url = `/api/auth/${platform}?site_id=${siteId}`;
      if (platform === "google" || platform === "gbp") {
        url = `/api/auth/google?site_id=${siteId}`;
      }

      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to start connection");
        setConnecting(null);
        return;
      }

      const { auth_url } = await res.json();
      window.location.href = auth_url;
    } catch {
      setError("Network error");
      setConnecting(null);
    }
  }

  const allConnected = connectedPlatforms.length >= PLATFORMS.length;

  return (
    <>
      {allConnected ? (
        <span className="text-xs text-success">All platforms connected</span>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-foreground hover:text-foreground"
        >
          + Connect
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setOpen(false); setError(""); }}
          />

          <div className="relative w-full max-w-md border border-border bg-background p-6">
            <div className="mb-5 flex items-center justify-between">
              <h2>Connect Platform</h2>
              <button
                onClick={() => { setOpen(false); setError(""); }}
                className="text-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-danger/10 p-2.5 text-sm text-danger">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {PLATFORMS.map((p) => {
                const isConnected = connectedPlatforms.includes(p.key);
                const isConnecting = connecting === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => !isConnected && handleConnect(p.key)}
                    disabled={isConnected || isConnecting}
                    className={`flex items-center gap-3 border p-3 text-left transition-colors ${
                      isConnected
                        ? "border-border opacity-40 cursor-default"
                        : "border-border hover:border-foreground disabled:opacity-50"
                    }`}
                  >
                    <PlatformIcon platform={p.key} size={20} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {isConnecting ? "Connecting..." : p.label}
                      </p>
                      {isConnected && (
                        <p className="text-[10px] text-success">Connected</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
