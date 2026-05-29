"use client";

import { useState, useEffect } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { AutopilotControls } from "@/app/admin/sites/[siteId]/website-pane";

interface Connection {
  platform: string;
  account_name: string;
  status: string;
}

interface PlatformCadence {
  timezone: string;
  frequency: number;
  active_days: string[];
  max_per_day: number;
  time_windows: string[];
  frequency_unit: string;
}

const ALL_PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "pinterest", "linkedin", "twitter", "gbp"];
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<string, string> = { mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S" };
const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube",
  pinterest: "Pinterest", linkedin: "LinkedIn", twitter: "X (Twitter)", gbp: "Google Business",
};

const DEFAULT_CADENCE: PlatformCadence = {
  timezone: "America/New_York",
  frequency: 0,
  active_days: ["mon", "tue", "wed", "thu", "fri"],
  max_per_day: 1,
  time_windows: ["09:00-17:00"],
  frequency_unit: "week",
};

function SocialConfigContent({ siteId }: { siteId: string }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [cadenceConfig, setCadenceConfig] = useState<Record<string, PlatformCadence>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/ops/site?site_id=${siteId}&view=overview`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setConnections(d?.platforms || []);
        setAutopilotEnabled(d?.site?.autopilot_enabled || false);
      });
    fetch(`/api/ops/site?site_id=${siteId}&view=publishing`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.site?.cadence_config) {
          setCadenceConfig(d.site.cadence_config as Record<string, PlatformCadence>);
        }
      })
      .finally(() => setLoading(false));
  }, [siteId]);

  async function toggleAutopilot() {
    const next = !autopilotEnabled;
    setSaving("autopilot");
    await fetch("/api/admin/image-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, autopilotEnabled: next }),
    });
    setAutopilotEnabled(next);
    setSaving(null);
  }

  function updateCadence(platform: string, patch: Partial<PlatformCadence>) {
    setCadenceConfig(prev => ({
      ...prev,
      [platform]: { ...(prev[platform] || DEFAULT_CADENCE), ...patch },
    }));
  }

  function toggleDay(platform: string, day: string) {
    const current = cadenceConfig[platform]?.active_days || DEFAULT_CADENCE.active_days;
    const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
    updateCadence(platform, { active_days: next });
  }

  async function saveCadence() {
    setSaving("cadence");
    setSaved(null);
    await fetch("/api/admin/image-style", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, cadenceConfig }),
    });
    setSaving(null);
    setSaved("cadence");
    setTimeout(() => setSaved(null), 2000);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const activeCount = connections.filter(c => c.status === "active").length;

  return (
    <div className="p-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-4">
          {/* Connections */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Social Connections ({activeCount}/8)</h3>
            <div className="space-y-1">
              {ALL_PLATFORMS.map(platform => {
                const conn = connections.find(c => c.platform === platform);
                return (
                  <div key={platform} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <span className="text-xs">{PLATFORM_LABELS[platform]}</span>
                    {conn ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted">{conn.account_name}</span>
                        <span className={`h-1.5 w-1.5 rounded-full ${conn.status === "active" ? "bg-success" : "bg-warning"}`} />
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted">Not connected</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Autopilot */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <h3 className="text-sm font-medium mb-3">Autopilot</h3>
            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={toggleAutopilot}
                disabled={saving === "autopilot"}
                className={`rounded px-4 py-1.5 text-xs font-medium ${
                  autopilotEnabled ? "bg-success text-white" : "bg-surface-hover text-muted"
                }`}
              >
                {autopilotEnabled ? "Active" : "Off"}
              </button>
            </div>
            <AutopilotControls siteId={siteId} />
          </div>
        </div>

        {/* Right column — Cadence per platform */}
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Cadence per Platform</h3>
              <div className="flex items-center gap-2">
                {saved === "cadence" && <span className="text-[10px] text-success">Saved</span>}
                <button
                  onClick={saveCadence}
                  disabled={saving === "cadence"}
                  className="bg-accent px-3 py-1 text-[10px] font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
                >
                  {saving === "cadence" ? "Saving..." : "Save Cadence"}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              {ALL_PLATFORMS.map(platform => {
                const cadence = cadenceConfig[platform] || DEFAULT_CADENCE;
                const isExpanded = expandedPlatform === platform;
                const isConnected = connections.some(c => c.platform === platform && c.status === "active");

                return (
                  <div key={platform} className={`border border-border rounded-lg overflow-hidden ${!isConnected ? "opacity-40" : ""}`}>
                    <button
                      onClick={() => setExpandedPlatform(isExpanded ? null : platform)}
                      className="flex w-full items-center justify-between px-3 py-2 hover:bg-surface-hover transition-colors"
                    >
                      <span className="text-xs font-medium">{PLATFORM_LABELS[platform]}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted">
                          {cadence.frequency > 0 ? `${cadence.frequency}/week` : "Off"}
                        </span>
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"
                          className={`opacity-40 transition-transform duration-150 ${isExpanded ? "rotate-90" : ""}`}>
                          <path d="M6 3l5 5-5 5V3z"/>
                        </svg>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-border space-y-3">
                        {/* Frequency */}
                        <div className="pt-2">
                          <label className="block text-[9px] text-muted mb-1">Posts per week</label>
                          <select
                            value={cadence.frequency}
                            onChange={e => updateCadence(platform, { frequency: Number(e.target.value) })}
                            className="rounded border border-border bg-background px-2 py-1 text-xs"
                          >
                            {[0, 1, 2, 3, 4, 5, 7].map(n => (
                              <option key={n} value={n}>{n === 0 ? "Off" : n}</option>
                            ))}
                          </select>
                        </div>

                        {/* Active days */}
                        <div>
                          <label className="block text-[9px] text-muted mb-1">Active days</label>
                          <div className="flex gap-1">
                            {DAYS.map((day, i) => (
                              <button
                                key={day}
                                onClick={() => toggleDay(platform, day)}
                                className={`w-7 h-7 rounded text-[10px] font-medium ${
                                  cadence.active_days.includes(day)
                                    ? "bg-accent text-white"
                                    : "bg-surface-hover text-muted"
                                }`}
                              >
                                {DAY_LABELS[day]}{i === 3 ? "h" : ""}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Max per day */}
                        <div>
                          <label className="block text-[9px] text-muted mb-1">Max posts per day</label>
                          <select
                            value={cadence.max_per_day}
                            onChange={e => updateCadence(platform, { max_per_day: Number(e.target.value) })}
                            className="rounded border border-border bg-background px-2 py-1 text-xs"
                          >
                            {[1, 2, 3, 4, 5].map(n => (
                              <option key={n} value={n}>{n}</option>
                            ))}
                          </select>
                        </div>

                        {/* Time windows */}
                        <div>
                          <label className="block text-[9px] text-muted mb-1">Time windows</label>
                          <div className="space-y-1">
                            {cadence.time_windows.map((tw, i) => (
                              <div key={i} className="flex items-center gap-1">
                                <input
                                  value={tw}
                                  onChange={e => {
                                    const updated = [...cadence.time_windows];
                                    updated[i] = e.target.value;
                                    updateCadence(platform, { time_windows: updated });
                                  }}
                                  className="rounded border border-border bg-background px-2 py-1 text-[10px] font-mono w-28"
                                  placeholder="09:00-17:00"
                                />
                                <button
                                  onClick={() => updateCadence(platform, { time_windows: cadence.time_windows.filter((_, idx) => idx !== i) })}
                                  className="text-[10px] text-muted hover:text-danger"
                                >✕</button>
                              </div>
                            ))}
                            {cadence.time_windows.length < 3 && (
                              <button
                                onClick={() => updateCadence(platform, { time_windows: [...cadence.time_windows, ""] })}
                                className="text-[10px] text-accent hover:underline"
                              >+ Add window</button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Social & Autopilot" requireSite>
      {({ siteId }) => <SocialConfigContent siteId={siteId} />}
    </ManagePage>
  );
}
