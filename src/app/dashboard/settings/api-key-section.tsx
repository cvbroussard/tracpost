"use client";

import { useState } from "react";

export function ApiKeySection() {
  const [loading, setLoading] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleRegenerate() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/api-key", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setNewKey(data.api_key);
        setConfirming(false);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <h2 className="mb-1 text-sm font-medium">API Key</h2>
      <p className="mb-4 text-xs text-muted">
        For programmatic API access. Keep this secret — it grants full access to your account.
      </p>

      {newKey ? (
        <div>
          <label className="mb-1 block text-xs text-danger">New API key (copy now — shown only once)</label>
          <div className="mb-3 flex items-center gap-2">
            <div className="min-w-0 flex-1 rounded border border-danger/30 bg-background px-3 py-2 font-mono text-xs break-all">
              {newKey}
            </div>
            <button
              onClick={handleCopy}
              className="shrink-0 rounded border border-border px-3 py-2 text-xs text-muted transition-colors hover:bg-surface-hover"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <button
            onClick={() => setNewKey(null)}
            className="text-xs text-muted hover:text-foreground"
          >
            Done
          </button>
        </div>
      ) : confirming ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-danger">This will invalidate your current key. Continue?</span>
          <button
            onClick={handleRegenerate}
            disabled={loading}
            className="rounded border border-danger/30 px-3 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
          >
            {loading ? "..." : "Yes, regenerate"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-hover"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="rounded border border-border px-3 py-2 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
        >
          Regenerate API Key
        </button>
      )}
    </section>
  );
}
