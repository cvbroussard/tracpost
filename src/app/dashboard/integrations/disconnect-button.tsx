"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DisconnectButton({ accountId, accountName }: { accountId: string; accountName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleDisconnect() {
    setLoading(true);
    try {
      await fetch(`/api/social-accounts/${accountId}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-danger">Disconnect {accountName}?</span>
        <button
          onClick={handleDisconnect}
          disabled={loading}
          className="rounded border border-danger/30 px-2 py-1 text-[10px] text-danger hover:bg-danger/10 disabled:opacity-50"
        >
          {loading ? "..." : "Yes"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded border border-border px-2 py-1 text-[10px] text-muted hover:bg-surface-hover"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-[10px] text-muted hover:text-danger"
    >
      Disconnect
    </button>
  );
}
