"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CompleteButton({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function complete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/onboarding-queue/${token}/complete`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete");
      setBusy(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-2">
        <p className="text-xs text-muted">Mark this onboarding complete?</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-full border border-border px-3 py-1.5 text-sm hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={complete}
            disabled={busy}
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Completing…" : "Yes, mark complete"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
    >
      Mark complete
    </button>
  );
}
