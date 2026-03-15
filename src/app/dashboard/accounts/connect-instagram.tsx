"use client";

import { useState } from "react";

export function ConnectInstagramButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPageIds, setShowPageIds] = useState(false);
  const [pageIds, setPageIds] = useState("");

  async function handleConnect() {
    setLoading(true);
    setError("");

    try {
      const params = pageIds.trim() ? `?page_ids=${pageIds.trim()}` : "";
      const res = await fetch(`/api/auth/instagram${params}`);

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
      {showPageIds && (
        <input
          type="text"
          value={pageIds}
          onChange={(e) => setPageIds(e.target.value)}
          className="rounded border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-accent"
          placeholder="Facebook Page ID(s)"
        />
      )}
      <button
        onClick={handleConnect}
        disabled={loading}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "Connecting..." : "Connect Instagram"}
      </button>
      {!showPageIds && (
        <button
          onClick={() => setShowPageIds(true)}
          className="text-[10px] text-muted hover:text-foreground"
        >
          Page ID?
        </button>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
