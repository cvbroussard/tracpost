"use client";

import { useState, useEffect, useCallback } from "react";
import { EmptyState } from "@/components/empty-state";
import { PlatformIcon } from "@/components/platform-icons";

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

function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function Field({ label, value, editable, onSave, format }: {
  label: string;
  value: string;
  editable?: boolean;
  format?: "phone";
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
          <div className="mt-1">
            {value.length > 60 ? (
              <textarea
                ref={(el) => {
                  if (el) {
                    el.style.height = "auto";
                    el.style.height = el.scrollHeight + "px";
                  }
                }}
                value={editValue}
                onChange={(e) => {
                  setEditValue(e.target.value);
                  const el = e.target;
                  el.style.height = "auto";
                  el.style.height = el.scrollHeight + "px";
                }}
                autoFocus
                className="w-full resize-none rounded-lg border border-accent/30 bg-background px-3 py-2 text-xs leading-relaxed focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
              />
            ) : (
              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-accent/30 bg-background px-3 py-2 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
              />
            )}
            {value.length > 60 && (
              <p className="mt-1 text-[9px] text-muted text-right">{editValue.length}/750</p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                onClick={async () => {
                  setSaving(true);
                  onSave?.(editValue);
                  setSaving(false);
                  setEditing(false);
                }}
                disabled={saving}
                className="rounded bg-accent px-3 py-1 text-[10px] font-medium text-white hover:bg-accent/90"
              >
                Save
              </button>
              <button
                onClick={() => { setEditing(false); setEditValue(value); }}
                className="rounded px-3 py-1 text-[10px] text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-xs">{value ? (format === "phone" ? formatPhone(value) : value) : <span className="text-muted">Not set</span>}</p>
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

interface SiteCategory {
  id: string;
  gcid: string;
  is_primary: boolean;
  name: string;
  reasoning: string | null;
}

function CategoryPicker({ siteId, onDirty }: { siteId: string; onDirty?: () => void }) {
  const [categories, setCategories] = useState<SiteCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ gcid: string; name: string }>>([]);
  const [searching, setSearching] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const loadCategories = useCallback(async () => {
    const res = await fetch(`/api/google/categories?site_id=${siteId}`);
    if (res.ok) {
      const data = await res.json();
      setCategories(data.categories || []);
    }
  }, [siteId]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  async function search(query: string) {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const res = await fetch(`/api/google/categories?search=${encodeURIComponent(query)}`);
    if (res.ok) {
      const data = await res.json();
      const existing = new Set(categories.map((c) => c.gcid));
      setSearchResults((data.categories || []).filter((c: { gcid: string }) => !existing.has(c.gcid)));
    }
    setSearching(false);
  }

  async function addCategory(gcid: string) {
    const res = await fetch("/api/google/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId, action: "add", gcid }),
    });
    if (res.ok) {
      setSearchQuery("");
      setSearchResults([]);
      loadCategories();
      onDirty?.();
    } else {
      const data = await res.json();
      setStatus(data.error || "Failed to add");
      setTimeout(() => setStatus(null), 3000);
    }
  }

  async function removeCategory(gcid: string) {
    await fetch("/api/google/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId, action: "remove", gcid }),
    });
    loadCategories();
    onDirty?.();
  }

  async function setPrimary(gcid: string) {
    await fetch("/api/google/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId, action: "set_primary", gcid }),
    });
    loadCategories();
    onDirty?.();
  }

  const primary = categories.find((c) => c.is_primary);
  const additional = categories.filter((c) => !c.is_primary);

  return (
    <Section title="Categories">
      {/* Current categories */}
      {categories.length > 0 ? (
        <div className="space-y-1">
          {primary && (
            <div className="flex items-center justify-between border-b border-border py-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{primary.name}</span>
                <span className="rounded border border-border px-1.5 py-0.5 text-[8px] font-medium text-muted">PRIMARY</span>
              </div>
              <button onClick={() => removeCategory(primary.gcid)} className="text-[9px] text-muted hover:text-danger">Remove</button>
            </div>
          )}
          {additional.map((cat) => (
            <div key={cat.gcid} className="flex items-center justify-between border-b border-border py-1.5 last:border-0">
              <span className="text-xs">{cat.name}</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPrimary(cat.gcid)} className="text-[9px] text-accent hover:underline">Make primary</button>
                <button onClick={() => removeCategory(cat.gcid)} className="text-[9px] text-muted hover:text-danger">Remove</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted mb-2">No categories assigned. Search to add.</p>
      )}

      {/* Search to add */}
      <div className="mt-3 relative">
        <input
          value={searchQuery}
          onChange={(e) => search(e.target.value)}
          placeholder="Search categories..."
          className="w-full bg-surface-hover px-3 py-1.5 text-xs rounded"
        />
        {searchResults.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded border border-border bg-surface shadow-lg max-h-48 overflow-y-auto">
            {searchResults.map((r) => (
              <button
                key={r.gcid}
                onClick={() => addCategory(r.gcid)}
                className="w-full px-3 py-2 text-left text-xs hover:bg-surface-hover border-b border-border last:border-0"
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
        {searching && <p className="mt-1 text-[9px] text-muted">Searching...</p>}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <p className="text-[9px] text-muted">{categories.length}/10 categories · 1 primary + {Math.max(0, categories.length - 1)} additional</p>
        {status && <span className="text-[9px] text-accent">{status}</span>}
      </div>
    </Section>
  );
}

function ServiceAreaInput({ onAdd }: { onAdd: (place: { placeId: string; placeName: string }) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ placeId: string; placeName: string }>>([]);
  const [searching, setSearching] = useState(false);

  async function search(q: string) {
    setQuery(q);
    if (q.length < 3) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/google/places-search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.predictions || []);
      }
    } catch { /* ignore */ }
    setSearching(false);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => search(e.target.value)}
        placeholder="Add a city or region..."
        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
      />
      {searching && <p className="mt-1 text-[9px] text-muted">Searching...</p>}
      {results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full rounded border border-border bg-surface shadow-lg max-h-40 overflow-y-auto">
          {results.map((r) => (
            <button
              key={r.placeId}
              onClick={() => {
                onAdd(r);
                setQuery("");
                setResults([]);
              }}
              className="w-full px-3 py-2 text-left text-xs hover:bg-surface-hover border-b border-border last:border-0"
            >
              {r.placeName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AskForReviewsCard({ profile, siteId, onStatus }: { profile: GbpProfile; siteId: string; onStatus: (msg: string | null) => void }) {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const location = profile.address.locality || "";
  const placeId = (profile as unknown as Record<string, unknown>).placeId as string | undefined;
  const reviewUrl = placeId
    ? `https://search.google.com/local/writereview?placeid=${placeId}`
    : `https://www.google.com/maps/search/${encodeURIComponent(profile.title + (location ? " " + location : ""))}`;

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(reviewUrl)}`;

  async function sendReviewRequest() {
    if (!email.trim() || !email.includes("@")) return;
    setSending(true);
    try {
      const res = await fetch("/api/google/review-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, email: email.trim(), review_url: reviewUrl }),
      });
      if (res.ok) {
        setSent(true);
        setEmail("");
        setTimeout(() => setSent(false), 4000);
      } else {
        onStatus("Failed to send");
        setTimeout(() => onStatus(null), 3000);
      }
    } catch {
      onStatus("Failed to send");
      setTimeout(() => onStatus(null), 3000);
    }
    setSending(false);
  }

  return (
    <Section title="Ask for Reviews">
      <p className="text-xs text-muted mb-3">
        Share this link with customers to collect Google reviews. More reviews improve your local search ranking.
      </p>

      {/* Review link */}
      <div className="flex items-center gap-2 mb-3">
        <input
          readOnly
          value={reviewUrl}
          className="flex-1 min-w-0 rounded-lg border border-border bg-surface-hover px-3 py-1.5 text-[10px] text-muted truncate"
        />
        <button
          onClick={() => {
            navigator.clipboard.writeText(reviewUrl);
            onStatus("Review link copied");
            setTimeout(() => onStatus(null), 2000);
          }}
          className="rounded bg-accent px-3 py-1.5 text-[10px] font-medium text-white hover:bg-accent/90 whitespace-nowrap"
        >
          Copy
        </button>
      </div>

      {/* Email request */}
      <div className="flex items-center gap-2 mb-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Customer email"
          className="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
        />
        <button
          onClick={sendReviewRequest}
          disabled={sending || !email.trim()}
          className="rounded bg-accent px-3 py-1.5 text-[10px] font-medium text-white hover:bg-accent/90 whitespace-nowrap disabled:opacity-50"
        >
          {sending ? "Sending..." : sent ? "Sent!" : "Send Request"}
        </button>
      </div>
      {sent && (
        <p className="text-[9px] text-success mb-3">Review request sent. The customer will receive an email with a link to leave a review.</p>
      )}

      {/* QR code */}
      <div className="flex items-start gap-3">
        <img src={qrUrl} alt="Review QR code" className="h-20 w-20 rounded border border-border" />
        <div>
          <p className="text-[10px] text-muted">QR Code</p>
          <p className="text-[9px] text-muted mt-0.5">Print or display at your job site. Customers scan to leave a review.</p>
          <a
            href={qrUrl}
            download="review-qr.png"
            className="mt-1 inline-block text-[9px] text-accent hover:underline"
          >
            Download QR
          </a>
        </div>
      </div>
    </Section>
  );
}

function SocialProfilesCard({ siteId }: { siteId: string }) {
  const [profiles, setProfiles] = useState<Array<{ platform: string; url: string; handle: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/google/social-profiles?site_id=${siteId}`)
      .then((r) => r.ok ? r.json() : { profiles: [] })
      .then((data) => setProfiles(data.profiles || []))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) return null;

  return (
    <Section title="Social Profiles">
      {profiles.length > 0 ? (
        <div className="space-y-1">
          {profiles.map((p) => (
              <div key={p.platform} className="flex items-center justify-between border-b border-border py-1.5 last:border-0">
                <div className="flex items-center gap-2">
                  <PlatformIcon platform={p.platform} size={14} />
                  <span className="text-xs">{p.handle}</span>
                </div>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] text-accent hover:underline"
                >
                  Open
                </a>
              </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted">No social accounts connected. Connect platforms from the Connections page to auto-populate.</p>
      )}
    </Section>
  );
}

export function ProfileClient({ siteId }: { siteId: string }) {
  const [profile, setProfile] = useState<GbpProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/google/profile?site_id=${siteId}`).then((r) => {
        if (!r.ok) throw new Error("No GBP connection");
        return r.json();
      }),
      fetch(`/api/google/profile?site_id=${siteId}&check_dirty=1`).then((r) => r.ok ? r.json() : null),
    ])
      .then(([profileData, dirtyData]) => {
        setProfile(profileData);
        if (dirtyData?.dirty) setDirty(true);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [siteId]);

  // Intercept nav-away when dirty — block link clicks, show inline warning
  const [navBlocked, setNavBlocked] = useState(false);
  const [blockedHref, setBlockedHref] = useState<string | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!dirty) return;
      const target = (e.target as HTMLElement).closest("a");
      if (target && target.href && !target.href.includes("/google/profile")) {
        e.preventDefault();
        e.stopPropagation();
        setBlockedHref(target.href);
        setNavBlocked(true);
      }
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [dirty]);

  async function saveField(field: string, value: string) {
    const res = await fetch("/api/google/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ site_id: siteId, [field]: value }),
    });
    const data = await res.json();
    if (data.success) {
      // Update local state so the UI reflects the edit
      setProfile((prev) => prev ? { ...prev, [field]: value } : prev);
      setDirty(true);
    }
  }

  async function pushToGoogle() {
    setPushing(true);
    setPushStatus(null);
    try {
      // Push profile fields
      const profileRes = await fetch("/api/google/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, action: "push" }),
      });
      const profileData = await profileRes.json();

      if (profileData.success) {
        setDirty(false);
        setPushStatus("Synced to Google");
      } else {
        setPushStatus(profileData.error || "Push failed");
      }
    } catch {
      setPushStatus("Push failed");
    }
    setPushing(false);
    setTimeout(() => setPushStatus(null), 4000);
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

  // Cover photo + logo from cached profile or top asset
  const coverUrl = (profile as unknown as Record<string, unknown>).coverPhotoUrl as string | undefined;
  const logoUrl = (profile as unknown as Record<string, unknown>).logoUrl as string | undefined;

  return (
    <div className="space-y-4">
      {/* Hero banner — cover photo + logo + identity */}
      <div className="relative overflow-hidden rounded-xl">
        {/* Cover photo */}
        <div className="h-44 bg-gradient-to-br from-gray-700 to-gray-900">
          {coverUrl && (
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          )}
          {!coverUrl && (
            <div className="flex h-full items-center justify-center">
              <p className="text-xs text-white/40">Cover photo — set from Photos tab</p>
            </div>
          )}
        </div>

        {/* Identity overlay */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-5 pb-4 pt-12">
          <div className="flex items-end gap-4">
            {/* Logo */}
            <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 border-white/20 bg-surface shadow-lg">
              {logoUrl ? (
                <img src={logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gray-800 text-lg font-bold text-white/60">
                  {profile.title.charAt(0)}
                </div>
              )}
            </div>

            {/* Business info */}
            <div className="flex-1 min-w-0 pb-0.5">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white truncate">{profile.title}</h2>
                {profile.metadata.hasVoiceOfMerchant && (
                  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M23 12l-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.81.34 3.68L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68L23 12z' fill='%2322c55e'/%3E%3Cpath d='M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z' fill='white'/%3E%3C/svg%3E" alt="Verified" className="h-5 w-5 flex-shrink-0" />
                )}
              </div>
              <p className="text-xs text-white/70">
                {profile.categories.primary}
                {profile.address.locality ? ` · ${profile.address.locality}, ${profile.address.administrativeArea}` : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Completeness + push controls */}
      <div className="px-4 flex items-center justify-between">
        <ScoreRing score={profile.completeness.score} />
        <div className="flex items-center gap-3">
          {pushStatus && (
            <span className="text-xs text-accent">{pushStatus}</span>
          )}
          {dirty && (
            <span className="rounded-full bg-warning/10 px-2.5 py-1 text-[10px] font-medium text-warning">
              Unsaved changes
            </span>
          )}
          <button
            onClick={pushToGoogle}
            disabled={pushing || !dirty}
            className={`rounded px-4 py-1.5 text-xs font-medium transition-colors ${
              dirty
                ? "bg-accent text-white hover:bg-accent/90"
                : "bg-surface-hover text-muted cursor-not-allowed"
            } disabled:opacity-50`}
          >
            {pushing ? "Pushing..." : "Push to Google"}
          </button>
        </div>
      </div>

      {/* Nav-away warning */}
      {navBlocked && (
        <div className="mx-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 flex items-center justify-between">
          <p className="text-xs text-warning">You have unpushed changes that won&apos;t reach Google until you push.</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setNavBlocked(false);
                setDirty(false);
                if (blockedHref) window.location.href = blockedHref;
              }}
              className="rounded px-3 py-1 text-[10px] text-muted hover:text-foreground"
            >
              Leave anyway
            </button>
            <button
              onClick={() => { setNavBlocked(false); setBlockedHref(null); }}
              className="rounded bg-warning px-3 py-1 text-[10px] font-medium text-white"
            >
              Stay and push
            </button>
          </div>
        </div>
      )}

      {/* Missing fields alert */}
      {profile.completeness.missing.length > 0 && (
        <div className="mx-4 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
          <p className="text-xs font-medium text-warning">Missing profile information</p>
          <p className="mt-1 text-[10px] text-muted">
            Complete these fields to improve your local search ranking: {profile.completeness.missing.join(", ")}
          </p>
        </div>
      )}

      {/* Two-column layout */}
      <div className="px-4 grid grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-4">
          <Section title="About">
            <Field label="Business Name" value={profile.title} />
            <Field
              label="Description"
              value={profile.description}
              editable
              onSave={(v) => saveField("description", v)}
            />
            <div className="flex items-center gap-3 border-b border-border py-2 last:border-0">
              <p className="text-[10px] text-muted whitespace-nowrap">Opening Date</p>
              <input
                type="date"
                value={profile.openingDate || ""}
                onChange={(e) => {
                  setProfile((prev) => prev ? { ...prev, openingDate: e.target.value } : prev);
                  setDirty(true);
                }}
                className="flex-1 min-w-0 rounded-lg border border-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
              />
            </div>
          </Section>

          <CategoryPicker siteId={siteId} onDirty={() => setDirty(true)} />

          <Section title="Contact">
            <Field
              label="Phone"
              value={profile.phoneNumber}
              editable
              format="phone"
              onSave={(v) => saveField("phoneNumber", v)}
            />
            <Field
              label="Website"
              value={profile.websiteUri}
              editable
              onSave={(v) => saveField("websiteUri", v)}
            />
          </Section>

          <Section title="Business Location">
            {(() => {
              const sa = profile.serviceArea as Record<string, unknown> | null;
              const businessType = (sa?.businessType as string) || "";
              const showsAddress = businessType === "CUSTOMER_AND_BUSINESS_LOCATION" || (!sa && addressStr);
              const places = ((sa?.places as Record<string, unknown>)?.placeInfos as Array<Record<string, string>>) || [];
              const placeNames = places.map((p) => p.placeName).filter(Boolean);

              return (
                <>
                  <div className="flex items-center justify-between border-b border-border py-2.5">
                    <div>
                      <p className="text-xs">Show business address to customers</p>
                      <p className="text-[9px] text-muted">
                        {showsAddress
                          ? "Your address is visible on your Google listing"
                          : "Only your service area is shown — no street address"}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        const newType = showsAddress ? "CUSTOMER_LOCATION_ONLY" : "CUSTOMER_AND_BUSINESS_LOCATION";
                        setProfile((prev) => prev ? {
                          ...prev,
                          serviceArea: { ...(prev.serviceArea || {}), businessType: newType },
                        } : prev);
                        setDirty(true);
                      }}
                      className={`relative h-6 w-11 rounded-full transition-colors ${showsAddress ? "bg-accent" : "bg-gray-300"}`}
                    >
                      <div className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${showsAddress ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                  </div>

                  {showsAddress && (
                    <div className="border-b border-border py-2 space-y-2">
                      <p className="text-[10px] text-muted">Address</p>
                      <input
                        value={profile.address.addressLines.join(", ")}
                        onChange={(e) => {
                          setProfile((prev) => prev ? {
                            ...prev,
                            address: { ...prev.address, addressLines: [e.target.value] },
                          } : prev);
                          setDirty(true);
                        }}
                        placeholder="Street address"
                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          value={profile.address.locality}
                          onChange={(e) => {
                            setProfile((prev) => prev ? {
                              ...prev,
                              address: { ...prev.address, locality: e.target.value },
                            } : prev);
                            setDirty(true);
                          }}
                          placeholder="City"
                          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                        />
                        <input
                          value={profile.address.administrativeArea}
                          onChange={(e) => {
                            setProfile((prev) => prev ? {
                              ...prev,
                              address: { ...prev.address, administrativeArea: e.target.value },
                            } : prev);
                            setDirty(true);
                          }}
                          placeholder="State"
                          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                        />
                        <input
                          value={profile.address.postalCode}
                          onChange={(e) => {
                            setProfile((prev) => prev ? {
                              ...prev,
                              address: { ...prev.address, postalCode: e.target.value },
                            } : prev);
                            setDirty(true);
                          }}
                          placeholder="Zip"
                          className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/20"
                        />
                      </div>
                    </div>
                  )}

                  <div className="py-2">
                    <p className="text-[10px] text-muted mb-1">Service Area</p>
                    {places.length > 0 && (
                      <div className="space-y-1 mb-2">
                        {places.map((place, i) => (
                          <div key={i} className="flex items-center justify-between border-b border-border py-1 last:border-0">
                            <span className="text-xs">{place.placeName}</span>
                            <button
                              onClick={() => {
                                const updatedPlaces = places.filter((_, j) => j !== i);
                                setProfile((prev) => prev ? {
                                  ...prev,
                                  serviceArea: {
                                    ...(prev.serviceArea || {}),
                                    businessType: showsAddress ? "CUSTOMER_AND_BUSINESS_LOCATION" : "CUSTOMER_LOCATION_ONLY",
                                    places: { placeInfos: updatedPlaces },
                                  },
                                } : prev);
                                setDirty(true);
                              }}
                              className="text-[9px] text-muted hover:text-danger"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <ServiceAreaInput
                      onAdd={(place) => {
                        const updatedPlaces = [...places, place];
                        setProfile((prev) => prev ? {
                          ...prev,
                          serviceArea: {
                            ...(prev.serviceArea || {}),
                            businessType: showsAddress ? "CUSTOMER_AND_BUSINESS_LOCATION" : "CUSTOMER_LOCATION_ONLY",
                            regionCode: "US",
                            places: { placeInfos: updatedPlaces },
                          },
                        } : prev);
                        setDirty(true);
                      }}
                    />
                  </div>
                </>
              );
            })()}
          </Section>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <Section title="Status">
            <div className="flex items-center gap-3 border-b border-border py-3">
              {profile.metadata.hasVoiceOfMerchant ? (
                <>
                  <img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M23 12l-2.44-2.78.34-3.68-3.61-.82-1.89-3.18L12 3 8.6 1.54 6.71 4.72l-3.61.81.34 3.68L1 12l2.44 2.78-.34 3.69 3.61.82 1.89 3.18L12 21l3.4 1.46 1.89-3.18 3.61-.82-.34-3.68L23 12z' fill='%2322c55e'/%3E%3Cpath d='M10 15.5l-3.5-3.5 1.41-1.41L10 12.67l5.59-5.59L17 8.5l-7 7z' fill='white'/%3E%3C/svg%3E" alt="" className="h-6 w-6 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium">Verified Owner</p>
                    <p className="text-[9px] text-muted">Google-verified business listing</p>
                  </div>
                </>
              ) : (
                <>
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-hover text-muted text-[10px]">?</span>
                  <div>
                    <p className="text-xs font-medium text-warning">Not Verified</p>
                    <p className="text-[9px] text-muted">Complete Google verification to unlock all features</p>
                  </div>
                </>
              )}
            </div>
            <Field label="Services Editable" value={profile.metadata.canModifyServiceList ? "Yes" : "No"} />
            <Field label="Resource ID" value={profile.name.split("/").pop() || profile.name} />
          </Section>

          <SocialProfilesCard siteId={siteId} />

          <AskForReviewsCard profile={profile} siteId={siteId} onStatus={setPushStatus} />

          <Section title="Hours">
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
        </div>
      </div>
    </div>
  );
}
