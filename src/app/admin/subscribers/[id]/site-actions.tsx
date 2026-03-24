"use client";

import { useState } from "react";

interface SiteActionsProps {
  siteId: string;
  siteName: string;
  isDeleted: boolean;
}

export function SiteActions({ siteId, siteName, isDeleted }: SiteActionsProps) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleAction = async () => {
    setLoading(true);
    const endpoint = isDeleted ? "/api/admin/sites/restore" : "/api/admin/sites/delete";
    await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId }),
    });
    window.location.reload();
  };

  if (confirming) {
    return (
      <span className="flex items-center gap-2">
        <span className="text-xs text-danger">
          {isDeleted ? "Restore?" : `Delete ${siteName}?`}
        </span>
        <button
          onClick={handleAction}
          disabled={loading}
          className="rounded px-2 py-0.5 text-xs font-medium text-white bg-danger hover:bg-danger/80 disabled:opacity-50"
        >
          {loading ? "..." : "Yes"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-muted hover:text-foreground"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className={`text-xs ${
        isDeleted
          ? "text-accent hover:text-accent/80"
          : "text-muted hover:text-danger"
      }`}
    >
      {isDeleted ? "Restore" : "Delete"}
    </button>
  );
}
