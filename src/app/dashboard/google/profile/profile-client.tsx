"use client";

import { useState, useEffect } from "react";
import { EmptyState } from "@/components/empty-state";

interface GbpProfile {
  name: string;
  title: string;
  description: string;
  phoneNumber: string;
  websiteUri: string;
  address: {
    addressLines: string[];
    locality: string;
    administrativeArea: string;
    postalCode: string;
    regionCode: string;
  };
  regularHours: Array<{
    day: string;
    openTime: string;
    closeTime: string;
  }>;
  specialHours: Array<{
    date: string;
    openTime: string;
    closeTime: string;
    isClosed: boolean;
  }>;
  categories: {
    primary: string;
    additional: string[];
  };
  serviceArea: Record<string, unknown> | null;
  openingDate: string | null;
  metadata: {
    hasVoiceOfMerchant: boolean;
    canModifyServiceList: boolean;
    canHaveFoodMenus: boolean;
  };
  completeness: {
    score: number;
    missing: string[];
  };
  synced_at?: string;
}

const DAY_ORDER = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"];
const DAY_SHORT: Record<string, string> = {
  MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu",
  FRIDAY: "Fri", SATURDAY: "Sat", SUNDAY: "Sun",
};

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? "text-success" : score >= 50 ? "text-warning" : "text-danger";
  return (
    <div className={`flex items-center gap-2 ${color}`}>
      <div className="relative h-14 w-14">
        <svg className="h-14 w-14 -rotate-90" viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.2" />
          <circle
            cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="3"
            strokeDasharray={`${score * 0.94} 100`}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{score}%</span>
      </div>
      <div>
        <p className="text-xs font-medium text-foreground">Profile Completeness</p>
        <p className="text-[10px] text-muted">{score >= 80 ? "Looking good" : "Room to improve"}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <h3 className="text-sm font-medium mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, value, editable, onSave }: {
  label: string;
  value: string;
  editable?: boolean;
  onSave?: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [saving, setSaving] = useState(false);

  return (
    <div className="flex items-start justify-between border-b border-border py-2 last:border-0">
      <div className="flex-1">
        <p className="text-[10px] text-muted">{label}</p>
        {editing ? (
          <div className="mt-0.5">
            {value.length > 60 ? (
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={3}
                className="w-full resize-none bg-surface-hover px-2 py-1 text-xs"
              />
            ) : (
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full bg-surface-hover px-2 py-1 text-xs"
              />
            )}
            <div className="mt-1 flex gap-1">
              <button
                onClick={async () => {
                  setSaving(true);
                  onSave?.(editValue);
                  setSaving(false);
                  setEditing(false);
                }}
                disabled={saving}
                className="rounded bg-accent px-2 py-0.5 text-[9px] text-white"
              >
                Save to Google
              </button>
              <button
                onClick={() => { setEditing(false); setEditValue(value); }}
                className="rounded px-2 py-0.5 text-[9px] text-muted"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-xs">{value || <span className="text-muted">Not set</span>}</p>
        )}
      </div>
      {editable && !editing && (
        <button onClick={() => setEditing(true)} className="text-[9px] text-accent hover:underline ml-2">
          Edit
        </button>
      )}
    </div>
  );
}

export function ProfileClient({ siteId }: { siteId: string }) {
  const [profile, setProfile] = useState<GbpProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/google/profile?site_id=${siteId}`)
      .then((r) => {
        if (!r.ok) throw new Error("No GBP connection");
        return r.json();
      })
      .then(setProfile)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [siteId]);

  async function saveField(field: string, value: string) {
    setSaveStatus("Saving...");
    const res = await fetch("/api/google/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId, [field]: value }),
    });
    const data = await res.json();
    if (data.success) {
      setSaveStatus("Saved to Google");
      // Refresh local data with the synced version
      if (data.title) setProfile(data);
    } else {
      setSaveStatus(data.error || "Save failed");
    }
    setTimeout(() => setSaveStatus(null), 3000);
  }

  async function refreshFromGoogle() {
    setSaveStatus("Syncing from Google...");
    const res = await fetch("/api/google/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId, action: "sync" }),
    });
    if (res.ok) {
      const data = await res.json();
      setProfile(data);
      setSaveStatus("Synced from Google");
    } else {
      setSaveStatus("Sync failed");
    }
    setTimeout(() => setSaveStatus(null), 3000);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-6">
        <EmptyState
          icon="◇"
          title="Connect Google Business Profile"
          description="Link your GBP account to manage your business profile, hours, and categories from one place."
        />
      </div>
    );
  }

  const addressStr = [
    ...profile.address.addressLines,
    profile.address.locality,
    profile.address.administrativeArea,
    profile.address.postalCode,
  ].filter(Boolean).join(", ");

  // Group hours by time for display
  const hoursByTime = new Map<string, string[]>();
  for (const h of profile.regularHours) {
    const key = `${h.openTime}-${h.closeTime}`;
    if (!hoursByTime.has(key)) hoursByTime.set(key, []);
    hoursByTime.get(key)!.push(h.day);
  }
  const closedDays = DAY_ORDER.filter((d) => !profile.regularHours.some((h) => h.day === d));

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      {/* Completeness + sync info */}
      <div className="flex items-center justify-between">
        <ScoreRing score={profile.completeness.score} />
        <div className="flex items-center gap-3">
          {saveStatus && (
            <span className="text-xs text-accent">{saveStatus}</span>
          )}
          <div className="text-right">
            {profile.synced_at && (
              <p className="text-[9px] text-muted">
                Last synced: {new Date(profile.synced_at).toLocaleDateString()}
              </p>
            )}
            <button
              onClick={refreshFromGoogle}
              className="text-[10px] text-accent hover:underline"
            >
              Refresh from Google
            </button>
          </div>
        </div>
      </div>

      {/* Missing fields alert */}
      {profile.completeness.missing.length > 0 && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
          <p className="text-xs font-medium text-warning">Missing profile information</p>
          <p className="mt-1 text-[10px] text-muted">
            Complete these fields to improve your local search ranking: {profile.completeness.missing.join(", ")}
          </p>
        </div>
      )}

      {/* Identity */}
      <Section title="Business Identity">
        <Field label="Business Name" value={profile.title} />
        <Field
          label="Description"
          value={profile.description}
          editable
          onSave={(v) => saveField("description", v)}
        />
        <Field label="Primary Category" value={profile.categories.primary} />
        {profile.categories.additional.length > 0 && (
          <Field label="Additional Categories" value={profile.categories.additional.join(", ")} />
        )}
        {profile.openingDate && (
          <Field label="Opening Date" value={profile.openingDate} />
        )}
      </Section>

      {/* Contact */}
      <Section title="Contact Information">
        <Field
          label="Phone"
          value={profile.phoneNumber}
          editable
          onSave={(v) => saveField("phoneNumber", v)}
        />
        <Field
          label="Website"
          value={profile.websiteUri}
          editable
          onSave={(v) => saveField("websiteUri", v)}
        />
        <Field label="Address" value={addressStr} />
      </Section>

      {/* Hours */}
      <Section title="Business Hours">
        {profile.regularHours.length > 0 ? (
          <div className="space-y-1">
            {DAY_ORDER.map((day) => {
              const hours = profile.regularHours.filter((h) => h.day === day);
              const isClosed = hours.length === 0;
              return (
                <div key={day} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                  <span className="text-xs w-12">{DAY_SHORT[day]}</span>
                  {isClosed ? (
                    <span className="text-xs text-muted">Closed</span>
                  ) : (
                    <span className="text-xs">
                      {hours.map((h) => `${h.openTime} — ${h.closeTime}`).join(", ")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted">No hours set. Adding business hours improves your local search visibility.</p>
        )}

        {/* Special hours */}
        {profile.specialHours.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10px] text-muted mb-2">Special Hours</p>
            {profile.specialHours.map((h, i) => (
              <div key={i} className="flex items-center justify-between py-1">
                <span className="text-xs">{h.date}</span>
                <span className="text-xs">
                  {h.isClosed ? "Closed" : `${h.openTime} — ${h.closeTime}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Service Area */}
      {profile.serviceArea && (
        <Section title="Service Area">
          <p className="text-xs">Service area business — serves customers at their location</p>
        </Section>
      )}

      {/* Profile metadata */}
      <Section title="Profile Status">
        <Field label="Voice of Merchant" value={profile.metadata.hasVoiceOfMerchant ? "Verified owner" : "Not verified"} />
        <Field label="Can Modify Services" value={profile.metadata.canModifyServiceList ? "Yes" : "No"} />
        <Field label="Resource Name" value={profile.name} />
      </Section>
    </div>
  );
}
