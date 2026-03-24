"use client";

import { useState } from "react";

interface SiteInfo {
  id: string;
  name: string;
  business_type: string | null;
  location: string | null;
  provisioning_status: string | null;
  autopilot_enabled: boolean;
  deleted_at: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  requested: { label: "Provisioning requested", color: "bg-warning/10 text-warning" },
  in_progress: { label: "Provisioning in progress", color: "bg-accent/10 text-accent" },
  complete: { label: "Active", color: "bg-success/10 text-success" },
};

export function SitesSection({ initialSites }: { initialSites: SiteInfo[] }) {
  const [sites, setSites] = useState(initialSites);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [domain, setDomain] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !businessType || !location) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/dashboard/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          businessType,
          location,
          domain: domain || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create site");
        return;
      }

      // Reload to pick up new session with the site
      window.location.reload();
    } catch {
      setError("Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  const activeSites = sites.filter((s) => !s.deleted_at);
  const deletedSites = sites.filter((s) => s.deleted_at);

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <h2>Sites</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded border border-border px-3 py-1 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            Add Site
          </button>
        )}
      </div>

      {/* Add Site Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-lg border border-border bg-surface p-5">
          <h3 className="mb-4 text-sm font-medium">New Site</h3>

          {error && (
            <p className="mb-4 rounded bg-danger/10 p-2 text-sm text-danger">{error}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Business Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Epicurious Kitchens"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Business Type *</label>
              <input
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                placeholder="Luxury Kitchen Remodeling"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Location *</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Greater Pittsburgh, PA"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Domain (optional)</label>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="epicuriouskitchens.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={submitting || !name || !businessType || !location}
              className="rounded-lg bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Create Site"}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setError(null); }}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Active Sites */}
      {activeSites.length > 0 ? (
        <div className="space-y-3">
          {activeSites.map((site) => {
            const status = STATUS_LABELS[site.provisioning_status || ""] || STATUS_LABELS.complete;
            return (
              <div
                key={site.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-4"
              >
                <div>
                  <p className="text-sm font-medium">{site.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {site.business_type || "—"} · {site.location || "—"}
                  </p>
                </div>
                <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${status.color}`}>
                  {status.label}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted">No active sites. Add one to get started.</p>
      )}

      {/* Deleted Sites */}
      {deletedSites.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted">Deleted</p>
          <div className="space-y-2">
            {deletedSites.map((site) => (
              <div
                key={site.id}
                className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 opacity-50"
              >
                <div>
                  <p className="text-sm font-medium">{site.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Deleted {new Date(site.deleted_at!).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded bg-danger/10 px-2 py-0.5 text-[10px] text-danger">deleted</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
