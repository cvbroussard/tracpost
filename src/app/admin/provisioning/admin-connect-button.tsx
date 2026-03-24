"use client";

import { useState } from "react";

const PLATFORMS = [
  { key: "instagram", label: "Instagram" },
  { key: "facebook", label: "Facebook" },
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube" },
  { key: "gbp", label: "Google Business" },
  { key: "twitter", label: "X (Twitter)" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "pinterest", label: "Pinterest" },
];

interface AdminConnectButtonProps {
  siteId: string;
  subscriberId: string;
  connectedPlatforms: string[];
}

export function AdminConnectButton({ siteId, subscriberId, connectedPlatforms }: AdminConnectButtonProps) {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState("");

  const unconnected = PLATFORMS.filter((p) => !connectedPlatforms.includes(p.key));

  if (unconnected.length === 0) return null;

  async function handleConnect(platform: string) {
    setConnecting(platform);
    setError("");

    try {
      const apiPlatform = platform === "gbp" ? "google" : platform;
      const url = `/api/auth/${apiPlatform}?site_id=${siteId}&subscriber_id=${subscriberId}`;

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

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen(!open)}
        className="text-xs font-medium text-accent hover:underline"
      >
        {open ? "▾ Connect accounts" : "▸ Connect accounts"}
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {error && (
            <p className="rounded bg-danger/10 p-2 text-xs text-danger">{error}</p>
          )}
          {unconnected.map((p) => (
            <button
              key={p.key}
              onClick={() => handleConnect(p.key)}
              disabled={connecting === p.key}
              className="flex w-full items-center justify-between rounded border border-border px-3 py-2 text-left text-xs transition-colors hover:border-accent"
            >
              <span>{p.label}</span>
              <span className="text-accent">
                {connecting === p.key ? "Connecting..." : "Connect"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
