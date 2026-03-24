"use client";

import { useState } from "react";

interface ProvisionActionsProps {
  siteId: string;
  status: string | null;
}

export function ProvisionActions({ siteId, status }: ProvisionActionsProps) {
  const [currentStatus, setCurrentStatus] = useState(status);
  const [loading, setLoading] = useState(false);

  async function advance(action: "start" | "complete") {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sites/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, action }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentStatus(data.status);
      }
    } finally {
      setLoading(false);
    }
  }

  if (currentStatus === "requested") {
    return (
      <button
        onClick={() => advance("start")}
        disabled={loading}
        className="bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "..." : "Start Provisioning"}
      </button>
    );
  }

  if (currentStatus === "in_progress") {
    return (
      <button
        onClick={() => advance("complete")}
        disabled={loading}
        className="bg-success/20 px-3 py-1 text-xs font-medium text-success hover:bg-success/30 disabled:opacity-50"
      >
        {loading ? "..." : "Mark Complete"}
      </button>
    );
  }

  if (currentStatus === "complete") {
    return (
      <span className="rounded bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
        Provisioned
      </span>
    );
  }

  return null;
}
