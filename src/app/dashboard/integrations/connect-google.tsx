"use client";

import { useState } from "react";
import { GoogleIcon } from "@/components/platform-icons";

export function ConnectGoogleButton({ siteId }: { siteId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConnect() {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/auth/google?site_id=${siteId}`);

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
        <GoogleIcon size={14} />
        {loading ? "Connecting..." : "Google Business"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </>
  );
}
