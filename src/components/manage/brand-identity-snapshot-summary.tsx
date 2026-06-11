/**
 * Operator-facing summary of the brand_identity_snapshot state for
 * step 12 (brand_identity_complete) in the provisioning drawer.
 *
 * Step 12 is the canonical handoff point from the brand identity pipeline
 * to the orchestrator per [[provisioning-scope]]: sealing the mutable
 * brand_descriptor catalog into an immutable snapshot that surfaces
 * translate from per [[brand-identity-layer-stack]].
 *
 * Surface scope:
 *   - Latest snapshot provenance (run #, sealed_at, descriptor count)
 *   - 4-domain completion at seal time (full catalog completeness audit)
 *   - Stale callout when the live catalog has diverged from the snapshot
 *   - Snapshot history (recent runs, newest first)
 *
 * Per the drawer doctrine ([[provisioning-drawer-console]]): the seal
 * ACTION lives in the drawer header's action panel (wired in
 * provisioning-graph TASK_ACTIONS). This component is the
 * monitoring/observability complement.
 */
"use client";

import { useState, useEffect, useCallback } from "react";

interface DomainCompletion {
  declared: number;
  total: number;
}

interface SnapshotPayloadMeta {
  snapshot_version: string;
  sealed_at: string;
  descriptor_count: number;
  domain_completion: {
    strategic: DomainCompletion;
    verbal: DomainCompletion;
    visual: DomainCompletion;
    sonic: DomainCompletion;
  };
  brand_identity_id: string;
}

interface SnapshotPayload {
  meta: SnapshotPayloadMeta;
}

interface SnapshotLatest {
  id: string;
  runNumber: number;
  payload: SnapshotPayload;
  generatedAt: string | null;
}

interface SnapshotHistoryEntry {
  id: string;
  runNumber: number;
  generatedAt: string | null;
  descriptorCount: number;
}

interface SnapshotApiResponse {
  latest: SnapshotLatest | null;
  history: SnapshotHistoryEntry[];
}

const DOMAIN_ORDER = ["strategic", "verbal", "visual", "sonic"] as const;
const DOMAIN_LABEL = {
  strategic: "Strategic",
  verbal: "Verbal",
  visual: "Visual",
  sonic: "Sonic",
} as const;

export function BrandIdentitySnapshotSummary({
  businessId,
  stale,
}: {
  businessId: string;
  /** True when the recompute layer detected a descriptor edit after seal. */
  stale?: boolean;
}) {
  const [data, setData] = useState<SnapshotApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/ops/brand-identity/snapshot?siteId=${businessId}`);
      if (!r.ok) throw new Error(`snapshot API ${r.status}`);
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return <p className="text-[11px] text-muted italic">Loading snapshot…</p>;
  }
  if (error) {
    return <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>;
  }
  if (!data?.latest) {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/40 px-3 py-4 text-center text-[11px] text-muted">
        No snapshot sealed yet. Click <strong>Seal canonical catalog</strong> after the
        4 domains are 100% declared.
      </div>
    );
  }

  const latest = data.latest;
  const meta = latest.payload.meta;
  const sealedAt = meta.sealed_at ? new Date(meta.sealed_at) : null;

  return (
    <div className="space-y-4">
      {/* Provenance */}
      <div className="rounded-md border border-border bg-card/40 px-3 py-2 space-y-1 text-[11px]">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted">Latest snapshot</span>
          <span className="text-foreground font-mono">Run #{latest.runNumber}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted">Sealed</span>
          <span className="text-foreground font-mono">
            {sealedAt ? sealedAt.toLocaleString() : "(unknown)"}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted">Descriptors captured</span>
          <span className="text-foreground font-mono">{meta.descriptor_count}</span>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted">Snapshot version</span>
          <span className="text-foreground font-mono">{meta.snapshot_version}</span>
        </div>
      </div>

      {/* Stale callout */}
      {stale && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
          <p className="font-medium mb-0.5">⚠ Catalog has diverged</p>
          <p className="text-amber-800/80 dark:text-amber-300/80 leading-relaxed">
            One or more descriptors were edited after the latest snapshot was sealed.
            Surfaces translating from the snapshot won&apos;t see the edits until you
            re-seal. Click <strong>Seal canonical catalog</strong> to capture the
            current state as a new snapshot.
          </p>
        </div>
      )}

      {/* Domain completion at seal time */}
      <section>
        <h4 className="text-[10px] uppercase tracking-wide text-muted font-medium mb-1.5">
          Completion at seal time
        </h4>
        <div className="space-y-1">
          {DOMAIN_ORDER.map((d) => {
            const c = meta.domain_completion[d];
            const full = c.declared === c.total;
            return (
              <div
                key={d}
                className="flex items-center justify-between text-xs px-2 py-1 rounded border border-border bg-card/30"
              >
                <span>{DOMAIN_LABEL[d]}</span>
                <span
                  className={`font-mono text-[11px] ${
                    full
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {c.declared}/{c.total}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* History */}
      {data.history.length > 1 && (
        <section>
          <h4 className="text-[10px] uppercase tracking-wide text-muted font-medium mb-1.5">
            Snapshot history ({data.history.length} runs)
          </h4>
          <div className="space-y-1">
            {data.history.slice(0, 10).map((h) => {
              const isLatest = h.id === latest.id;
              const at = h.generatedAt ? new Date(h.generatedAt) : null;
              return (
                <div
                  key={h.id}
                  className={`flex items-center justify-between text-[11px] px-2 py-1 rounded border ${
                    isLatest
                      ? "border-accent/40 bg-accent/5"
                      : "border-border bg-card/30"
                  }`}
                >
                  <span className="font-mono">
                    #{h.runNumber}
                    {isLatest && (
                      <span className="ml-1.5 text-[9px] text-accent uppercase">
                        latest
                      </span>
                    )}
                  </span>
                  <span className="text-muted">
                    {at ? at.toLocaleString() : "(unknown)"} ·{" "}
                    {h.descriptorCount} descriptors
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
