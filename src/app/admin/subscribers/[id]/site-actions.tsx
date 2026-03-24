"use client";

import { useState } from "react";

interface SiteActionsProps {
  siteId: string;
  siteName: string;
  isDeleted: boolean;
  deletionStatus: string | null;
}

export function SiteActions({ siteId, siteName, isDeleted, deletionStatus: initialStatus }: SiteActionsProps) {
  const [status, setStatus] = useState(initialStatus);
  const [confirming, setConfirming] = useState<"approve" | "deny" | "restore" | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleAction(action: string, endpoint: string) {
    setLoading(true);
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, action }),
    });
    window.location.reload();
  }

  // Deleted sites — show restore
  if (isDeleted) {
    if (confirming === "restore") {
      return (
        <span className="flex items-center gap-2">
          <span className="text-xs text-accent">Restore {siteName}?</span>
          <button
            onClick={() => handleAction("restore", "/api/admin/sites/restore")}
            disabled={loading}
            className="rounded px-2 py-0.5 text-xs font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "..." : "Yes"}
          </button>
          <button onClick={() => setConfirming(null)} className="text-xs text-muted hover:text-foreground">
            Cancel
          </button>
        </span>
      );
    }
    return (
      <button onClick={() => setConfirming("restore")} className="text-xs text-accent hover:text-accent/80">
        Restore
      </button>
    );
  }

  // Pending deletion request — show approve/deny
  if (status === "pending") {
    if (confirming === "approve") {
      return (
        <span className="flex items-center gap-2">
          <span className="text-xs text-danger">Approve deletion?</span>
          <button
            onClick={() => handleAction("approve", "/api/admin/sites/delete")}
            disabled={loading}
            className="rounded px-2 py-0.5 text-xs font-medium text-white bg-danger hover:bg-danger/80 disabled:opacity-50"
          >
            {loading ? "..." : "Yes"}
          </button>
          <button onClick={() => setConfirming(null)} className="text-xs text-muted hover:text-foreground">
            Cancel
          </button>
        </span>
      );
    }
    return (
      <span className="flex items-center gap-2">
        <button
          onClick={() => setConfirming("approve")}
          className="text-xs text-danger hover:text-danger/80"
        >
          Approve Delete
        </button>
        <button
          onClick={() => handleAction("deny", "/api/admin/sites/delete")}
          disabled={loading}
          className="text-xs text-muted hover:text-foreground"
        >
          {loading ? "..." : "Deny"}
        </button>
      </span>
    );
  }

  // Active site, no pending request — no delete action (subscriber must request)
  return null;
}
