"use client";

import { useState, useEffect, useCallback } from "react";
import { CmaRequiredBlocker } from "./cma-required-blocker";

interface ServiceHero {
  asset_id: string;
  url: string;
  alt: string | null;
  prompt: string | null;
  generated_at: string | null;
  catalog_descriptors_used: string[];
  catalog_descriptors_missing: string[];
}

interface SiteService {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price_range: string | null;
  duration: string | null;
  display_order: number;
  source: string;
  metadata: Record<string, unknown> | null;
  primary_gcid: string | null;
  primary_category_name: string | null;
  associated_gcids: string[];
  associated_category_names: Array<{ gcid: string; name: string }>;
  hero_asset_id: string | null;
  hero: ServiceHero | null;
  created_at: string;
  updated_at: string;
}

interface RegenResult {
  ok: boolean;
  clustersCount: number;
  servicesCreated: number;
  bound: number;
  unbound: number;
  details: {
    clusters: Array<{ cluster_id: string; intent_label: string; memberQueryCount: number }>;
    services: Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      cluster_id: string;
      cluster_intent_label: string;
    }>;
    binding: {
      bound: Array<{ service_id: string; service_name: string; primary_gcid: string; category_name: string }>;
      unbound: Array<{ service_id: string; service_name: string; cluster_id: string }>;
    };
  };
}

export function ServicesClient({ siteId }: { siteId: string }) {
  const [services, setServices] = useState<SiteService[]>([]);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [lastResult, setLastResult] = useState<RegenResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cmaBlocker, setCmaBlocker] = useState<{ code: "no_cma" | "no_tier2"; message: string } | null>(null);

  const loadServices = useCallback(async () => {
    if (!siteId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/site-services/${siteId}`);
      if (!res.ok) throw new Error(`Load failed (${res.status})`);
      const d = await res.json();
      setServices(d.services || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    setLastResult(null);
    loadServices();
  }, [loadServices]);

  async function regenerate() {
    if (!siteId) return;
    if (
      !confirm(
        "Regenerate services for this site?\n\n" +
          "This DELETES all current 'auto' services and replaces them with the " +
          "cluster-driven set. Owner-edited services are preserved. Existing " +
          "service URLs may break if slugs change. The live site is invalidated " +
          "automatically.\n\nProceed?",
      )
    ) {
      return;
    }
    setRegenerating(true);
    setError(null);
    setLastResult(null);
    setCmaBlocker(null);
    try {
      const res = await fetch(`/api/admin/site-services/${siteId}/regenerate`, {
        method: "POST",
      });
      const d = (await res.json()) as
        | RegenResult
        | { ok: false; error: string; code?: "no_cma" | "no_tier2"; message?: string };
      if (res.status === 412 && "error" in d && d.error === "cma_required" && d.code && d.message) {
        setCmaBlocker({ code: d.code, message: d.message });
        return;
      }
      if (!res.ok || !("ok" in d) || !d.ok) {
        const msg = "message" in d ? d.message : "error" in d ? d.error : `HTTP ${res.status}`;
        throw new Error(msg || `HTTP ${res.status}`);
      }
      setLastResult(d as RegenResult);
      await loadServices();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenerating(false);
    }
  }

  const autoCount = services.filter((s) => s.source === "auto").length;
  const manualCount = services.length - autoCount;

  return (
    <div className="space-y-4 p-4">
      {cmaBlocker && <CmaRequiredBlocker code={cmaBlocker.code} message={cmaBlocker.message} />}
      {/* Trigger panel */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-[10px] text-muted leading-relaxed">
              Runs the cluster-driven pipeline: CMA queries → intent clustering → brand-voiced
              service generation → N:1 category anchor binding. Replaces existing 'auto'
              services in full. Requires a completed CMA — run one manually via Competitive
              Analysis first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted">
              {services.length === 0
                ? "No services yet"
                : `${services.length} service${services.length === 1 ? "" : "s"}` +
                  (autoCount && manualCount ? ` (${autoCount} auto, ${manualCount} manual)` : "")}
            </span>
            <button
              onClick={regenerate}
              disabled={regenerating || !siteId}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-wait"
            >
              {regenerating ? "Regenerating… (~60-90s)" : "Regenerate services"}
            </button>
          </div>
        </div>
        {error && <p className="mt-2 text-[10px] text-danger">{error}</p>}
      </div>

      {lastResult && (
        <div className="rounded-xl border border-success/40 bg-success/5 p-4 shadow-card">
          <h3 className="text-sm font-medium text-success">
            ✓ Regenerated successfully
          </h3>
          <p className="mt-1 text-[10px] text-muted">
            Created {lastResult.servicesCreated} service{lastResult.servicesCreated === 1 ? "" : "s"} from{" "}
            {lastResult.clustersCount} cluster{lastResult.clustersCount === 1 ? "" : "s"}; {lastResult.bound} bound to a
            primary category, {lastResult.unbound} unbound.
          </p>
        </div>
      )}

      {loading && services.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted shadow-card">
          Loading services…
        </div>
      )}

      {!loading && services.length === 0 && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-card">
          <p className="text-xs text-muted">No services exist for this site yet.</p>
          <p className="mt-1 text-[10px] text-muted">
            Click &quot;Regenerate services&quot; to derive them from the most recent CMA.
          </p>
        </div>
      )}

      {services.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="mb-3 text-sm font-medium">Current services ({services.length})</h3>
          <div className="space-y-2">
            {services.map((s) => (
              <ServiceCard key={s.id} svc={s} siteId={siteId} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface HeroPreview {
  prompt: string;
  alt: string;
  catalogDescriptorsUsed: string[];
  catalogDescriptorsMissing: string[];
}

function ServiceCard({ svc: initial, siteId }: { svc: SiteService; siteId: string }) {
  const [svc, setSvc] = useState(initial);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [justRefreshed, setJustRefreshed] = useState(false);

  // Hero generation state
  const [heroPanelOpen, setHeroPanelOpen] = useState(false);
  const [heroPreview, setHeroPreview] = useState<HeroPreview | null>(null);
  const [heroPreviewing, setHeroPreviewing] = useState(false);
  const [heroGenerating, setHeroGenerating] = useState(false);
  const [heroError, setHeroError] = useState<string | null>(null);

  const sourceStyles =
    svc.source === "auto"
      ? { label: "AUTO", color: "bg-accent/10 text-accent border-accent/30" }
      : { label: svc.source.toUpperCase(), color: "bg-background text-muted border-border" };
  const clusterIntent = (svc.metadata as { cluster_intent_label?: string } | null)?.cluster_intent_label;
  const canRegen = svc.source === "auto" && Boolean(clusterIntent);
  const hasHero = Boolean(svc.hero);

  async function regenerate() {
    if (!canRegen || regenerating) return;
    setRegenerating(true);
    setRegenError(null);
    try {
      const res = await fetch(`/api/admin/site-services/${siteId}/${svc.id}/regenerate`, {
        method: "POST",
      });
      const d = (await res.json()) as
        | { ok: true; service: { id: string; name: string; description: string; priceRange: string | null; duration: string | null } }
        | { ok?: false; error: string; message?: string };
      if (!res.ok || !("ok" in d) || !d.ok) {
        const msg = "message" in d ? d.message : "error" in d ? d.error : `HTTP ${res.status}`;
        throw new Error(msg || `HTTP ${res.status}`);
      }
      setSvc((prev) => ({
        ...prev,
        name: d.service.name,
        description: d.service.description,
        price_range: d.service.priceRange,
        duration: d.service.duration,
      }));
      setJustRefreshed(true);
      setTimeout(() => setJustRefreshed(false), 2500);
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenerating(false);
    }
  }

  async function openHeroPanel() {
    setHeroPanelOpen(true);
    setHeroError(null);
    if (heroPreview) return; // already loaded
    setHeroPreviewing(true);
    try {
      const res = await fetch(
        `/api/admin/site-services/${siteId}/${svc.id}/preview-hero-prompt`,
        { method: "POST" },
      );
      const d = await res.json();
      if (!res.ok || !d.ok) {
        throw new Error(d.message || d.error || `HTTP ${res.status}`);
      }
      setHeroPreview({
        prompt: d.prompt,
        alt: d.alt,
        catalogDescriptorsUsed: d.catalogDescriptorsUsed ?? [],
        catalogDescriptorsMissing: d.catalogDescriptorsMissing ?? [],
      });
    } catch (e) {
      setHeroError(e instanceof Error ? e.message : String(e));
    } finally {
      setHeroPreviewing(false);
    }
  }

  function closeHeroPanel() {
    setHeroPanelOpen(false);
    setHeroPreview(null);
    setHeroError(null);
  }

  async function commitHeroGeneration() {
    setHeroGenerating(true);
    setHeroError(null);
    try {
      const res = await fetch(
        `/api/admin/site-services/${siteId}/${svc.id}/generate-hero`,
        { method: "POST" },
      );
      const d = await res.json();
      if (!res.ok || !d.ok) {
        throw new Error(d.message || d.error || `HTTP ${res.status}`);
      }
      setSvc((prev) => ({
        ...prev,
        hero_asset_id: d.assetId,
        hero: {
          asset_id: d.assetId,
          url: d.url,
          alt: d.alt,
          prompt: d.prompt,
          generated_at: new Date().toISOString(),
          catalog_descriptors_used: d.catalogDescriptorsUsed ?? [],
          catalog_descriptors_missing: d.catalogDescriptorsMissing ?? [],
        },
      }));
      // Close panel after success — operator sees the new hero on the card
      setHeroPreview(null);
      setHeroPanelOpen(false);
    } catch (e) {
      setHeroError(e instanceof Error ? e.message : String(e));
    } finally {
      setHeroGenerating(false);
    }
  }

  return (
    <div className={`rounded border-l-2 ${justRefreshed ? "border-l-success bg-success/5" : "border-l-border bg-background"} p-3 transition-colors`}>
      <div className="flex items-start gap-3">
        {/* Hero thumbnail (when present) */}
        {hasHero && svc.hero && (
          <a
            href={svc.hero.url}
            target="_blank"
            rel="noopener noreferrer"
            title={svc.hero.alt ?? "Service hero image"}
            className="shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={svc.hero.url}
              alt={svc.hero.alt ?? ""}
              className="w-24 aspect-[16/9] rounded border border-border object-cover"
            />
          </a>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-xs font-semibold">{svc.name}</h4>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-medium ${sourceStyles.color}`}>
              {sourceStyles.label}
            </span>
            {svc.primary_category_name && (
              <span
                className="inline-flex items-center rounded-full border border-accent/50 bg-accent/10 px-2 py-0.5 text-[9px] font-medium text-accent"
                title={`Primary GBP anchor: ${svc.primary_gcid}`}
              >
                ⚓ {svc.primary_category_name}
              </span>
            )}
            {svc.associated_category_names
              ?.filter((c) => c.gcid !== svc.primary_gcid)
              .map((c) => (
                <span
                  key={c.gcid}
                  className="inline-flex items-center rounded-full border border-border bg-card/50 px-2 py-0.5 text-[9px] text-muted"
                  title={`Cluster-associated category: ${c.gcid}`}
                >
                  + {c.name}
                </span>
              ))}
            {!svc.primary_gcid && svc.source === "auto" && (
              <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[9px] text-warning">
                ⚠ Unbound
              </span>
            )}
            {justRefreshed && (
              <span className="inline-flex items-center rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-[9px] text-success">
                ✓ Refreshed
              </span>
            )}
          </div>
          {svc.description && (
            <p className="mt-1 text-[11px] leading-relaxed text-muted">{svc.description}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] text-muted">
            <span>slug: <code>{svc.slug}</code></span>
            {svc.price_range && <span>price: {svc.price_range}</span>}
            {svc.duration && <span>duration: {svc.duration}</span>}
            {clusterIntent && <span>cluster intent: &quot;{clusterIntent}&quot;</span>}
          </div>
          {regenError && (
            <p className="mt-1 text-[10px] text-danger">{regenError}</p>
          )}
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1">
          {canRegen && (
            <button
              type="button"
              onClick={regenerate}
              disabled={regenerating}
              title="Refresh name + description (slug, hero, category anchor preserved)"
              className="rounded border border-border bg-background px-2 py-1 text-[10px] hover:bg-card disabled:opacity-50 disabled:cursor-wait"
            >
              {regenerating ? "↻ Refreshing…" : "↻ Refresh"}
            </button>
          )}
          {canRegen && (
            <button
              type="button"
              onClick={heroPanelOpen ? closeHeroPanel : openHeroPanel}
              disabled={heroGenerating}
              title={hasHero ? "Regenerate hero image (preview prompt first)" : "Generate hero image (preview prompt first)"}
              className="rounded border border-border bg-background px-2 py-1 text-[10px] hover:bg-card disabled:opacity-50"
            >
              {heroPanelOpen ? "× Close" : hasHero ? "🖼 Regenerate hero" : "🖼 Generate hero"}
            </button>
          )}
        </div>
      </div>

      {/* Hero panel — opens below the card row */}
      {heroPanelOpen && (
        <div className="mt-3 border-t border-border pt-3">
          {heroPreviewing && (
            <p className="text-[10px] text-muted">Building prompt + alt from catalog… (~5-10s)</p>
          )}
          {heroError && (
            <p className="mt-1 text-[10px] text-danger">{heroError}</p>
          )}
          {heroPreview && (
            <div className="space-y-2">
              <div>
                <label className="text-[9px] uppercase tracking-wide text-muted">Image prompt (will fire to Nano Banana)</label>
                <pre className="mt-1 text-[10px] text-foreground bg-card/40 border border-border rounded p-2 whitespace-pre-wrap break-words font-mono leading-relaxed">{heroPreview.prompt}</pre>
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-wide text-muted">Alt text (will save with image)</label>
                <p className="mt-1 text-[10px] text-foreground bg-card/40 border border-border rounded p-2">{heroPreview.alt}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] text-muted">
                {heroPreview.catalogDescriptorsUsed.length > 0 && (
                  <span>
                    Catalog inputs used: <span className="text-foreground">{heroPreview.catalogDescriptorsUsed.join(", ")}</span>
                  </span>
                )}
                {heroPreview.catalogDescriptorsMissing.length > 0 && (
                  <span>
                    Missing: <span className="text-warning">{heroPreview.catalogDescriptorsMissing.join(", ")}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={commitHeroGeneration}
                  disabled={heroGenerating}
                  className="rounded bg-accent px-3 py-1.5 text-[10px] font-medium text-white hover:bg-accent-hover disabled:opacity-50 disabled:cursor-wait"
                >
                  {heroGenerating ? "🎨 Generating… (~20-40s, $0.04)" : "🎨 Generate image"}
                </button>
                <button
                  type="button"
                  onClick={closeHeroPanel}
                  disabled={heroGenerating}
                  className="rounded border border-border bg-background px-3 py-1.5 text-[10px] hover:bg-card disabled:opacity-50"
                >
                  Cancel
                </button>
                <span className="text-[9px] text-muted">
                  Prompt + alt are catalog-derived — to change them, update the brand catalog and reopen this panel.
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
