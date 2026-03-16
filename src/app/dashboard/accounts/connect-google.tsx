"use client";

import { useState } from "react";

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
    <div className="flex items-center gap-2">
      <button
        onClick={handleConnect}
        disabled={loading}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "Connecting..." : "Connect Google Business"}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
