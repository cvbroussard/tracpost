"use client";

import { useState } from "react";
import { PhoneField } from "@/components/phone-input";

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

const PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "gbp", label: "Google Business" },
  { id: "twitter", label: "X (Twitter)" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "pinterest", label: "Pinterest" },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  requested: { label: "Provisioning requested", color: "bg-warning/10 text-warning" },
  in_progress: { label: "Provisioning in progress", color: "bg-accent/10 text-accent" },
  complete: { label: "Active", color: "bg-success/10 text-success" },
};

type FormStep = "closed" | "details" | "confirm";

export function SitesSection({ initialSites }: { initialSites: SiteInfo[] }) {
  const [sites] = useState(initialSites);
  const [step, setStep] = useState<FormStep>("closed");
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [domain, setDomain] = useState("");
  const [phone, setPhone] = useState("");
  const [existingAccounts, setExistingAccounts] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toCreate = PLATFORMS.filter((p) => !existingAccounts.has(p.id));
  const toLink = PLATFORMS.filter((p) => existingAccounts.has(p.id));

  function resetForm() {
    setStep("closed");
    setName("");
    setBusinessType("");
    setLocation("");
    setDomain("");
    setPhone("");
    setExistingAccounts(new Set());
    setError(null);
  }

  async function handleSubmit() {
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
          phone: phone || undefined,
          existingAccounts: Array.from(existingAccounts),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create site");
        setStep("details");
        return;
      }

      window.location.reload();
    } catch {
      setError("Request failed");
      setStep("details");
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
        {step === "closed" && (
          <button
            onClick={() => setStep("details")}
            className="rounded border border-border px-3 py-1 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            Add Site
          </button>
        )}
      </div>

      {/* Step 1: Details */}
      {step === "details" && (
        <div className="mb-6">
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
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Business Type *</label>
              <input
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
                placeholder="Luxury Kitchen Remodeling"
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Location *</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Greater Pittsburgh, PA"
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Domain (optional)</label>
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="epicuriouskitchens.com"
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Business Phone</label>
              <PhoneField
                value={phone}
                onChange={setPhone}
                className="w-full text-sm"
              />
              <p className="mt-1 text-[11px] text-dim">
                Shown on your Google Business listing. Used for verification.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-xs text-muted">
              I have existing accounts on:
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PLATFORMS.map((p) => (
                <label key={p.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={existingAccounts.has(p.id)}
                    onChange={(e) => {
                      setExistingAccounts((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(p.id);
                        else next.delete(p.id);
                        return next;
                      });
                    }}
                    className="accent-accent"
                  />
                  <span className={existingAccounts.has(p.id) ? "text-foreground" : "text-muted"}>
                    {p.label}
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-dim">
              Unchecked platforms will be created for you during provisioning.
            </p>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setStep("confirm")}
              disabled={!name || !businessType || !location}
              className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Review
            </button>
            <button
              onClick={resetForm}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Confirmation */}
      {step === "confirm" && (
        <div className="mb-6">
          <h3 className="mb-4 text-sm font-medium">Confirm New Site</h3>

          <div className="space-y-2 mb-4">
            <div className="flex justify-between border-b border-border py-2 text-sm">
              <span className="text-muted">Business</span>
              <span className="font-medium">{name}</span>
            </div>
            <div className="flex justify-between border-b border-border py-2 text-sm">
              <span className="text-muted">Type</span>
              <span>{businessType}</span>
            </div>
            <div className="flex justify-between border-b border-border py-2 text-sm">
              <span className="text-muted">Location</span>
              <span>{location}</span>
            </div>
            {domain && (
              <div className="flex justify-between border-b border-border py-2 text-sm">
                <span className="text-muted">Domain</span>
                <span>{domain}</span>
              </div>
            )}
            {phone && (
              <div className="flex justify-between border-b border-border py-2 text-sm">
                <span className="text-muted">Phone</span>
                <span>{phone}</span>
              </div>
            )}
          </div>

          {toLink.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-medium text-accent">Will be linked (existing)</p>
              <div className="flex flex-wrap gap-1.5">
                {toLink.map((p) => (
                  <span key={p.id} className="rounded bg-accent/10 px-2 py-0.5 text-xs text-accent">
                    {p.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {toCreate.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs font-medium text-warning">Will be created for you</p>
              <div className="flex flex-wrap gap-1.5">
                {toCreate.map((p) => (
                  <span key={p.id} className="rounded bg-warning/10 px-2 py-0.5 text-xs text-warning">
                    {p.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="mb-4 rounded bg-danger/10 p-2 text-sm text-danger">{error}</p>
          )}

          <div className="mt-4 flex gap-3">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "Creating..." : "Confirm & Submit"}
            </button>
            <button
              onClick={() => setStep("details")}
              className="text-xs text-muted hover:text-foreground"
            >
              Back
            </button>
            <button
              onClick={resetForm}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active Sites */}
      {activeSites.length > 0 ? (
        <div className="space-y-3">
          {activeSites.map((site) => {
            const status = STATUS_LABELS[site.provisioning_status || ""] || STATUS_LABELS.complete;
            return (
              <div
                key={site.id}
                className="flex items-baseline justify-between border-b border-border py-2"
              >
                <div>
                  <span className="text-sm font-medium">{site.name}</span>
                  <span className="ml-2 text-xs text-muted">
                    {site.business_type || "—"} · {site.location || "—"}
                  </span>
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
          {deletedSites.map((site) => (
            <div
              key={site.id}
              className="flex items-baseline justify-between border-b border-border py-2 opacity-50"
            >
              <div>
                <span className="text-sm font-medium">{site.name}</span>
                <span className="ml-2 text-xs text-muted">
                  Deleted {new Date(site.deleted_at!).toLocaleDateString()}
                </span>
              </div>
              <span className="rounded bg-danger/10 px-2 py-0.5 text-[10px] text-danger">deleted</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
