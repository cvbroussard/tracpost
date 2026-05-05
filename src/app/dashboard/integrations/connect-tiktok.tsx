"use client";

import { useState } from "react";
import { TikTokIcon } from "@/components/platform-icons";

export function ConnectTikTokButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConnect() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/tiktok");

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to start OAuth");
        return;
      }

      const { auth_url } = await res.json();
      window.location.href = auth_url;
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={handleConnect}
        disabled={loading}
        className="flex items-center gap-2 border border-border px-3 py-1.5 text-sm text-muted transition-colors hover:border-foreground hover:text-foreground disabled:opacity-50"
      >
        <TikTokIcon size={14} />
        {loading ? "Connecting..." : "TikTok"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </>
  );
}
