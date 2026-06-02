"use client";

import { useState, useEffect, useCallback } from "react";

interface BrandBasics {
  name: string | null;
  founderName: string | null;
  foundingYear: number | null;
  originContext: string | null;
}

interface Site {
  id: string;
  name: string;
}

export function BrandBasicsClient({ subscriberId }: { subscriberId: string }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [basics, setBasics] = useState<BrandBasics | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Local form state
  const [founderName, setFounderName] = useState("");
  const [foundingYear, setFoundingYear] = useState("");
  const [originContext, setOriginContext] = useState("");

  useEffect(() => {
    fetch(`/api/admin/sites?subscription_id=${subscriberId}`)
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((d: { sites: Site[] }) => {
        setSites(d.sites || []);
        if (d.sites?.length > 0) setSelectedSiteId(d.sites[0].id);
      });
  }, [subscriberId]);

  const loadBasics = useCallback(async () => {
    if (!selectedSiteId) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/admin/brand-basics/${selectedSiteId}`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const d = (await res.json()) as BrandBasics;
      setBasics(d);
      setFounderName(d.founderName ?? "");
      setFoundingYear(d.foundingYear !== null ? String(d.foundingYear) : "");
      setOriginContext(d.originContext ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    loadBasics();
  }, [loadBasics]);

  async function save() {
    if (!selectedSiteId) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const yearNum = foundingYear.trim() === "" ? null : Number(foundingYear);
      if (yearNum !== null && (!Number.isInteger(yearNum) || yearNum < 1700 || yearNum > 2200)) {
        setError("Founding year must be an integer between 1700 and 2200.");
        setSaving(false);
        return;
      }
      const res = await fetch(`/api/admin/brand-basics/${selectedSiteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          founderName: founderName.trim() === "" ? null : founderName,
          foundingYear: yearNum,
          originContext: originContext.trim() === "" ? null : originContext,
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || `Save failed (${res.status})`);
        return;
      }
      setBasics(d.payload);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (!subscriberId) {
    return <div className="p-4 text-xs text-muted">Select a subscriber to view brand basics.</div>;
  }

  const completeness =
    [basics?.name, basics?.founderName, basics?.foundingYear, basics?.originContext].filter(
      (v) => v !== null && v !== "",
    ).length;

  return (
    <div className="space-y-4 p-4">
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className="text-[10px] text-muted">Business</label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="mt-1 w-full max-w-md rounded border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
            >
              {sites.length === 0 && <option>No businesses</option>}
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          {basics && (
            <div className="text-[10px] text-muted">
              Completeness: <span className="font-medium">{completeness}/4</span>
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted shadow-card">
          Loading…
        </div>
      )}

      {basics && !loading && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="mb-3">
            <h3 className="text-sm font-medium">Canonical brand facts</h3>
            <p className="mt-0.5 text-[10px] text-muted">
              These flow into every downstream LLM call (strategic recommendation, schema generator,
              copywriter agency-role) and the business&apos;s JSON-LD schema. Fill what you know — all
              three are optional and can be backfilled later.
            </p>
          </div>

          <div className="space-y-3">
            {/* Business name — read-only, set via business edit flow */}
            <div>
              <label className="text-[10px] font-semibold text-muted">Business name</label>
              <div className="mt-0.5 rounded border border-border bg-background px-3 py-1.5 text-xs">
                {basics.name || <span className="text-muted">— not set —</span>}
              </div>
              <p className="mt-0.5 text-[9px] text-muted">
                Canonical name (read-only here — rename via business settings).
              </p>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-muted" htmlFor="founder-name">
                Founder / owner name
              </label>
              <input
                id="founder-name"
                type="text"
                value={founderName}
                onChange={(e) => setFounderName(e.target.value)}
                placeholder="e.g. Joe Smith"
                className="mt-0.5 w-full rounded border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
              />
              <p className="mt-0.5 text-[9px] text-muted">
                Used in author bios, JSON-LD founder field, trust-signal copy.
              </p>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-muted" htmlFor="founding-year">
                Founding year
              </label>
              <input
                id="founding-year"
                type="number"
                inputMode="numeric"
                value={foundingYear}
                onChange={(e) => setFoundingYear(e.target.value)}
                placeholder="e.g. 1985"
                min={1700}
                max={2200}
                className="mt-0.5 w-32 rounded border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
              />
              <p className="mt-0.5 text-[9px] text-muted">
                Schema.org foundingDate. Powers &quot;since YYYY&quot; trust signals.
              </p>
            </div>

            <div>
              <label className="text-[10px] font-semibold text-muted" htmlFor="origin-context">
                Origin context
              </label>
              <textarea
                id="origin-context"
                value={originContext}
                onChange={(e) => setOriginContext(e.target.value)}
                placeholder="One paragraph: why does this business exist? What's the founding story or the operating principle that's true on day 1 and day 1000?"
                rows={5}
                maxLength={500}
                className="mt-0.5 w-full rounded border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
              />
              <p className="mt-0.5 text-[9px] text-muted">
                {originContext.length}/500 — shapes positioning angles, about-page copy, voice
                calibration. Keep it to a paragraph.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-3 border-t border-border pt-3">
            {saved && (
              <span className="text-[10px] text-success">✓ Saved</span>
            )}
            {error && (
              <span className="text-[10px] text-danger">{error}</span>
            )}
            <button
              onClick={save}
              disabled={saving || !selectedSiteId}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
