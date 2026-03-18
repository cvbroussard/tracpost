"use client";

import { useState } from "react";
import {
  InstagramIcon,
  TikTokIcon,
  GoogleIcon,
  FacebookIcon,
  PlatformIcon,
} from "@/components/platform-icons";

interface ConnectModalProps {
  siteId: string | null;
}

const PLATFORMS = [
  { key: "instagram", label: "Instagram", icon: InstagramIcon, ready: true },
  { key: "tiktok", label: "TikTok", icon: TikTokIcon, ready: true },
  { key: "facebook", label: "Facebook", icon: FacebookIcon, ready: false, note: "Pending app review" },
  { key: "gbp", label: "Google Business", icon: GoogleIcon, ready: false, note: "Pending API access" },
  { key: "youtube", label: "YouTube", icon: PlatformIcon, ready: false },
  { key: "twitter", label: "Twitter / X", icon: PlatformIcon, ready: true },
  { key: "linkedin", label: "LinkedIn", icon: PlatformIcon, ready: false },
  { key: "pinterest", label: "Pinterest", icon: PlatformIcon, ready: false },
];

export function ConnectButton({ siteId }: ConnectModalProps) {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleConnect(platform: string) {
    setConnecting(platform);
    setError("");

    try {
      let url = `/api/auth/${platform}`;
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

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-foreground hover:text-foreground"
      >
        + Connect
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => { setOpen(false); setError(""); }}
          />

          {/* Modal */}
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
              <div className="mb-4 rounded-lg bg-danger/10 p-2.5 text-sm text-danger">
                {error}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              {PLATFORMS.map((p) => {
                const IconComponent = p.icon;
                const isConnecting = connecting === p.key;
                return (
                  <button
                    key={p.key}
                    onClick={() => p.ready && handleConnect(p.key)}
                    disabled={!p.ready || isConnecting}
                    className={`flex items-center gap-3 border p-3 text-left transition-colors ${
                      p.ready
                        ? "border-border hover:border-foreground"
                        : "border-border opacity-40"
                    }`}
                  >
                    <IconComponent platform={p.key} size={20} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {isConnecting ? "Connecting..." : p.label}
                      </p>
                      {p.note && (
                        <p className="truncate text-xs text-muted">{p.note}</p>
                      )}
                      {!p.ready && !p.note && (
                        <p className="text-xs text-muted">Coming soon</p>
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
