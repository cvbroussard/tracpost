"use client";

import { useState, useEffect, useCallback } from "react";

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
    try {
      const res = await fetch(`/api/admin/site-services/${siteId}/regenerate`, {
        method: "POST",
      });
      const d = (await res.json()) as RegenResult | { error: string; message?: string };
      if (!res.ok || !("ok" in d) || !d.ok) {
        const msg = "message" in d ? d.message : "error" in d ? d.error : `HTTP ${res.status}`;
        throw new Error(msg);
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
      {/* Trigger panel */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-[10px] text-muted leading-relaxed">
              Runs the cluster-driven pipeline: CMA queries → intent clustering → brand-voiced
              service generation → N:1 category anchor binding. Replaces existing 'auto'
              services in full. Requires a completed CMA — runs against the most recent one.
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
              <ServiceCard key={s.id} svc={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceCard({ svc }: { svc: SiteService }) {
  const sourceStyles =
    svc.source === "auto"
      ? { label: "AUTO", color: "bg-accent/10 text-accent border-accent/30" }
      : { label: svc.source.toUpperCase(), color: "bg-background text-muted border-border" };
  const clusterIntent = (svc.metadata as { cluster_intent_label?: string } | null)?.cluster_intent_label;
  return (
    <div className="rounded border-l-2 border-l-border bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="text-xs font-semibold">{svc.name}</h4>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-medium ${sourceStyles.color}`}>
              {sourceStyles.label}
            </span>
            {svc.primary_category_name && (
              <span
                className="inline-flex items-center rounded-full border border-border bg-card/50 px-2 py-0.5 text-[9px] text-foreground"
                title={`Primary GBP anchor: ${svc.primary_gcid}`}
              >
                ⚓ {svc.primary_category_name}
              </span>
            )}
            {!svc.primary_gcid && svc.source === "auto" && (
              <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[9px] text-warning">
                ⚠ Unbound
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
        </div>
      </div>
    </div>
  );
}
