"use client";

import { useState } from "react";

interface ProvisionActionsProps {
  siteId: string;
  status: string | null;
}

export function ProvisionActions({ siteId, status }: ProvisionActionsProps) {
  // Treat null as 'requested' — matches the listing badge, which also
  // collapses null + 'requested' into the same "Requested" state.
  const [currentStatus, setCurrentStatus] = useState(status ?? "requested");
  const [loading, setLoading] = useState(false);
  const [automationLog, setAutomationLog] = useState<string[] | null>(null);

  async function advance(action: "start" | "complete") {
    setLoading(true);
    setAutomationLog(null);
    try {
      const res = await fetch("/api/admin/sites/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, action }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentStatus(data.status);
        if (data.automation) {
          setAutomationLog(data.automation);
          // Don't reload if there are failures — admin needs to see the log
          if (!data.automation.some((a: string) => a.includes("failed"))) {
            window.location.reload();
            return;
          }
        } else {
          window.location.reload();
          return;
        }
      }
    } finally {
      setLoading(false);
    }
  }

  if (currentStatus === "requested") {
    return (
      <div>
        <button
          onClick={() => advance("start")}
          disabled={loading}
          className="bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Generating playbook + blog..." : "Start Provisioning"}
        </button>
        {loading && (
          <p className="mt-1 text-[10px] text-muted animate-pulse">
            This may take a couple minutes
          </p>
        )}
      </div>
    );
  }

  if (currentStatus === "in_progress") {
    const hasFailed = automationLog?.some((item) => item.includes("failed"));
    return (
      <div>
        {automationLog && automationLog.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1">
            {automationLog.map((item, i) => (
              <span
                key={i}
                className={`rounded px-1.5 py-0.5 text-[10px] ${
                  item.includes("failed") ? "bg-danger/10 text-danger" : "bg-success/10 text-success"
                }`}
              >
                {item}
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          {hasFailed && (
            <button
              onClick={() => advance("start")}
              disabled={loading}
              className="bg-warning/20 px-3 py-1 text-xs font-medium text-warning hover:bg-warning/30 disabled:opacity-50"
            >
              {loading ? "Retrying..." : "Retry"}
            </button>
          )}
          <button
            onClick={() => advance("complete")}
            disabled={loading}
            className="bg-success/20 px-3 py-1 text-xs font-medium text-success hover:bg-success/30 disabled:opacity-50"
          >
            {loading ? "..." : "Mark Complete"}
          </button>
        </div>
      </div>
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
