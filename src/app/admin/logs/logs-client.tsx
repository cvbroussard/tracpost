"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";

interface LogLine {
  timestamp: string;
  severity: string;
  message: string;
}

interface LogEntry {
  timestamp: string;
  severity: string;
  message: string;
  route: string;
  method: string;
  statusCode: number | null;
  duration: number | null;
  source: string;
  host: string;
  region: string;
  requestId: string;
  logs: LogLine[];
}

const SEVERITY_COLORS: Record<string, { dot: string; text: string }> = {
  error: { dot: "bg-red-500", text: "text-red-400" },
  warning: { dot: "bg-amber-500", text: "text-amber-400" },
  info: { dot: "bg-blue-500", text: "text-blue-400" },
  debug: { dot: "bg-gray-500", text: "text-gray-400" },
};

const METHOD_COLORS: Record<string, string> = {
  GET: "text-green-400",
  POST: "text-blue-400",
  PUT: "text-amber-400",
  PATCH: "text-amber-400",
  DELETE: "text-red-400",
};

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function LogsClient() {
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState(searchParams.get("severity") || "");
  const [route, setRoute] = useState("");
  const [search, setSearch] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const copyLogs = (entry: LogEntry, i: number, filter?: string) => {
    const filtered = filter
      ? entry.logs.filter((l) => l.severity === filter)
      : entry.logs;
    const lines = [
      `${entry.method} ${entry.route} ${entry.statusCode || ""} ${entry.duration ? entry.duration + "ms" : ""}`.trim(),
      `Time: ${entry.timestamp}`,
      "",
      ...filtered.map((l) => `[${l.severity === "error" ? "ERR" : l.severity === "warning" ? "WRN" : "LOG"}] ${l.message}`),
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(lines);
    setCopied(i);
    setTimeout(() => setCopied(null), 2000);
  };

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams();
    if (severity) params.set("severity", severity);
    if (route) params.set("route", route);
    if (search) params.set("search", search);
    params.set("minutes", String(minutes));

    try {
      const res = await fetch(`/api/admin/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [severity, route, search, minutes]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const errorCount = entries.filter((e) => e.severity === "error").length;
  const warnCount = entries.filter((e) => e.severity === "warning").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium">Platform Logs</h1>
          <p className="text-xs text-muted">
            {entries.length} requests
            {errorCount > 0 && <span className="ml-2 text-red-400">{errorCount} errors</span>}
            {warnCount > 0 && <span className="ml-2 text-amber-400">{warnCount} warnings</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`rounded px-2.5 py-1 text-[11px] border transition-colors ${
              autoRefresh
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-border text-muted hover:text-foreground"
            }`}
          >
            {autoRefresh ? "● Live" : "○ Paused"}
          </button>
          <button
            onClick={() => { setLoading(true); fetchLogs(); }}
            className="rounded border border-border px-2.5 py-1 text-[11px] text-muted hover:text-foreground"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value)}
          className="rounded border border-border bg-background px-2.5 py-1.5 text-xs"
        >
          <option value="">All severity</option>
          <option value="error">Errors & warnings</option>
          <option value="warning">Warnings</option>
          <option value="info">Info</option>
        </select>

        <select
          value={minutes}
          onChange={(e) => setMinutes(Number(e.target.value))}
          className="rounded border border-border bg-background px-2.5 py-1.5 text-xs"
        >
          <option value={15}>Last 15 min</option>
          <option value={60}>Last hour</option>
          <option value={360}>Last 6 hours</option>
          <option value={1440}>Last 24 hours</option>
        </select>

        <input
          type="text"
          value={route}
          onChange={(e) => setRoute(e.target.value)}
          placeholder="Filter by route..."
          className="rounded border border-border bg-background px-2.5 py-1.5 text-xs w-44"
        />

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search message..."
          className="rounded border border-border bg-background px-2.5 py-1.5 text-xs w-44"
        />

        {(severity || route || search || minutes !== 60) && (
          <button
            onClick={() => { setSeverity(""); setRoute(""); setSearch(""); setMinutes(60); }}
            className="text-[11px] text-muted hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {/* Log stream */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium">No logs found</p>
          <p className="mt-1 text-xs text-muted">Try adjusting your filters or time range.</p>
        </div>
      ) : (
        <div ref={scrollRef} className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
          <div className="divide-y divide-border">
            {entries.map((entry, i) => {
              const colors = SEVERITY_COLORS[entry.severity] || SEVERITY_COLORS.info;
              const isExpanded = expanded.has(i);
              const hasLogs = entry.logs && entry.logs.length > 0;
              const statusColor = entry.statusCode
                ? entry.statusCode >= 500 ? "text-red-400"
                : entry.statusCode >= 400 ? "text-amber-400"
                : "text-green-400"
                : "text-muted";

              return (
                <div key={i}>
                  {/* Request row */}
                  <div
                    onClick={() => toggle(i)}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors hover:bg-surface-hover font-mono text-[11px] ${
                      isExpanded ? "bg-surface-hover" : ""
                    }`}
                  >
                    {/* Expand indicator */}
                    <span className={`text-[9px] text-muted w-3 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}>
                      {hasLogs ? "▶" : " "}
                    </span>

                    {/* Severity dot */}
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${colors.dot}`} />

                    {/* Time */}
                    <span className="text-muted w-16 shrink-0" title={entry.timestamp}>
                      {formatTime(entry.timestamp)}
                    </span>

                    {/* Method */}
                    <span className={`w-10 shrink-0 font-medium ${METHOD_COLORS[entry.method] || "text-muted"}`}>
                      {entry.method || "—"}
                    </span>

                    {/* Route */}
                    <span className="flex-1 truncate min-w-0" title={entry.route}>
                      {entry.route || entry.message || "—"}
                    </span>

                    {/* Status */}
                    <span className={`w-8 text-right shrink-0 ${statusColor}`}>
                      {entry.statusCode || ""}
                    </span>

                    {/* Duration */}
                    <span className="w-14 text-right shrink-0 text-muted">
                      {entry.duration ? `${entry.duration}ms` : ""}
                    </span>

                    {/* Log count badge */}
                    {hasLogs && (
                      <span className="shrink-0 rounded bg-surface-hover px-1.5 py-0.5 text-[9px] text-muted">
                        {entry.logs.length}
                      </span>
                    )}
                  </div>

                  {/* Expanded: console output + metadata */}
                  {isExpanded && (
                    <div className="bg-black/20 border-t border-border">
                      {/* Metadata row with severity counts + copy */}
                      <div className="flex items-center justify-between px-10 py-2 text-[10px] border-b border-border/50">
                        <div className="flex gap-6 text-muted">
                          {entry.host && <span>Host: {entry.host}</span>}
                          {entry.region && <span>Region: {entry.region}</span>}
                          {entry.source && <span>Source: {entry.source}</span>}
                          {entry.requestId && <span>ID: {entry.requestId.slice(0, 12)}</span>}
                        </div>
                        <div className="flex items-center gap-4">
                          {entry.logs.some((l) => l.severity === "error") && (
                            <button
                              onClick={(e) => { e.stopPropagation(); copyLogs(entry, i, "error"); }}
                              className="text-sm text-red-400 hover:text-red-300 transition-colors"
                              title="Copy errors"
                            >
                              {copied === i ? "✓" : "⧉"} {entry.logs.filter((l) => l.severity === "error").length}
                            </button>
                          )}
                          {entry.logs.some((l) => l.severity === "warning") && (
                            <button
                              onClick={(e) => { e.stopPropagation(); copyLogs(entry, i, "warning"); }}
                              className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
                              title="Copy warnings"
                            >
                              {copied === i ? "✓" : "⧉"} {entry.logs.filter((l) => l.severity === "warning").length}
                            </button>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); copyLogs(entry, i); }}
                            className="text-sm text-foreground hover:text-white transition-colors"
                            title="Copy all"
                          >
                            {copied === i ? "✓" : "⧉"}
                          </button>
                        </div>
                      </div>

                      {/* Console lines */}
                      {hasLogs ? (
                        <div className="px-6 py-2 space-y-0.5">
                          {entry.logs.map((log, j) => {
                            const logColors = SEVERITY_COLORS[log.severity] || SEVERITY_COLORS.info;
                            return (
                              <div key={j} className="flex items-start gap-2 font-mono text-[10px]">
                                <span className="text-muted shrink-0 w-16">{formatTime(log.timestamp)}</span>
                                <span className={`shrink-0 ${logColors.text}`}>
                                  {log.severity === "error" ? "ERR" : log.severity === "warning" ? "WRN" : "LOG"}
                                </span>
                                <span className="whitespace-pre-wrap break-all">{log.message}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : entry.message ? (
                        <div className="px-6 py-2">
                          <pre className="font-mono text-[10px] whitespace-pre-wrap break-all">{entry.message}</pre>
                        </div>
                      ) : (
                        <div className="px-6 py-2 text-[10px] text-muted">No console output</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
