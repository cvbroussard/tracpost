"use client";

import { useEffect, useState } from "react";
import { ManagePage } from "@/components/manage/manage-page";

/**
 * Components — flat top-level list of media_components rendered for this
 * site. Each component is a first-class operator object; source asset is
 * shown as provenance (lineage attribute), not as a parent hierarchy.
 * Click a component for its detail — the rendered video, the source
 * still beside it for fidelity comparison, and the Director + Producer
 * production_events that produced it.
 */

interface ProductionEvent {
  process: string;
  model: string | null;
  prompt: string | null;
  settings: Record<string, unknown> | null;
  created_at: string;
}

interface ShotDirection {
  renderPrompt?: string;
  cameraMove?: string;
  brandsMentioned?: string[];
}

interface RenderSettings {
  template?: string;
  producer_model?: string;
  duration_seconds?: number;
  shot_direction?: ShotDirection;
}

interface Component {
  id: string;
  kind: string;
  storage_url: string;
  source_asset_id: string | null;
  source_asset_url: string | null;
  source_asset_media_type: string | null;
  status: string;
  created_at: string;
  render_settings: RenderSettings | null;
  events: ProductionEvent[];
}

function ComponentsList({ siteId }: { siteId: string }) {
  // null = not yet loaded (loading derived from this); [] = loaded empty.
  // The parent passes `key={siteId}` so React remounts on site change —
  // no stale flash, no synchronous setState in the effect.
  const [components, setComponents] = useState<Component[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Component | null>(null);

  useEffect(() => {
    if (siteId === "all") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/ops/components?siteId=${encodeURIComponent(siteId)}`,
        );
        if (!res.ok) {
          if (!cancelled) setError(`fetch failed (${res.status})`);
          return;
        }
        const data = await res.json();
        if (!cancelled) setComponents(data.components ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (siteId === "all") {
    return (
      <div className="p-6 text-sm text-muted">Pick a site to see its components.</div>
    );
  }
  if (error) {
    return <div className="p-6 text-sm text-danger">Error: {error}</div>;
  }
  if (components === null) {
    return <div className="p-6 text-sm text-muted">Loading…</div>;
  }
  if (components.length === 0) {
    return (
      <div className="p-6 text-sm text-muted">
        No components yet. Run a render in Motion Gen to populate this list.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="text-[10px] uppercase tracking-wide text-muted">
        {components.length} component{components.length === 1 ? "" : "s"}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {components.map((c) => (
          <ComponentCard key={c.id} component={c} onOpen={() => setSelected(c)} />
        ))}
      </div>
      {selected && (
        <ComponentDetail component={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function ComponentCard({
  component,
  onOpen,
}: {
  component: Component;
  onOpen: () => void;
}) {
  // Capture the video's intrinsic dimensions on metadata-load so the
  // operator can see actual encoded size + aspect (catches mismatches
  // like "requested 9:16, got landscape").
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const rs = component.render_settings || {};
  const sd = rs.shot_direction || {};
  const dateStr = new Date(component.created_at).toLocaleString();
  return (
    <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden flex flex-col">
      {/* Natural-aspect display — no container aspect lock, no
          object-contain letterboxing. Video sizes to its intrinsic
          aspect, centred in the bg-black area, capped at 28rem tall
          or full card width (whichever hits first). HTML5 controls
          overlay on the video itself by default. */}
      <div className="flex items-center justify-center bg-black min-h-48">
        <video
          src={component.storage_url}
          controls
          preload="metadata"
          onLoadedMetadata={(e) => {
            setDims({
              w: e.currentTarget.videoWidth,
              h: e.currentTarget.videoHeight,
            });
          }}
          className="block max-w-full max-h-[28rem]"
        />
      </div>
      <div className="p-3 space-y-2 text-xs flex-1 flex flex-col">
        <div className="flex flex-wrap items-center gap-1.5 text-[9px] font-mono uppercase tracking-wide">
          {rs.template && (
            <span className="rounded bg-accent/15 px-1.5 py-0.5 text-accent">
              {rs.template}
            </span>
          )}
          {rs.producer_model && (
            <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-violet-400">
              {rs.producer_model}
            </span>
          )}
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-400">
            {component.status}
          </span>
          {dims && (
            <span className="rounded border border-border bg-background px-1.5 py-0.5 text-muted normal-case">
              {dims.w}×{dims.h}
            </span>
          )}
        </div>
        {sd.cameraMove && (
          <div className="text-[11px]">
            <span className="text-muted/70">move:</span> {sd.cameraMove}
          </div>
        )}
        <div className="text-[10px] text-muted/70">{dateStr}</div>
        {component.source_asset_id && (
          <div className="text-[9px] font-mono text-muted/60 break-all">
            src: {component.source_asset_id.slice(0, 8)}…
          </div>
        )}
        <div className="flex-1" />
        <button
          onClick={onOpen}
          className="self-start text-[10px] text-accent hover:underline"
        >
          Details →
        </button>
      </div>
    </div>
  );
}

function ComponentDetail({
  component,
  onClose,
}: {
  component: Component;
  onClose: () => void;
}) {
  const rs = component.render_settings || {};
  const sd = rs.shot_direction || {};
  const director = component.events.find((e) => e.process === "director_call");
  const producer = component.events.find((e) => e.process === "producer_call");
  const sourceIsVideo =
    component.source_asset_media_type?.toLowerCase().startsWith("video") ?? false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-5xl my-8 rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded bg-surface/90 px-2 py-1 text-xs hover:bg-surface border border-border"
        >
          Close
        </button>
        <div className="p-5 space-y-4">
          {/* Render + Source side-by-side */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted">
                Render
              </div>
              <div className="rounded bg-black flex items-center justify-center min-h-72">
                <video
                  src={component.storage_url}
                  controls
                  className="block max-w-full max-h-[60vh]"
                />
              </div>
              <div className="mt-1 text-[9px] font-mono text-muted/70 break-all">
                {component.storage_url}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted">
                Source
              </div>
              {component.source_asset_url ? (
                <div className="rounded bg-black flex items-center justify-center min-h-72">
                  {sourceIsVideo ? (
                    <video
                      src={component.source_asset_url}
                      controls
                      className="block max-w-full max-h-[60vh]"
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={component.source_asset_url}
                      alt=""
                      className="block max-w-full max-h-[60vh]"
                    />
                  )}
                </div>
              ) : (
                <div className="rounded border border-border bg-background p-4 text-xs text-muted italic">
                  source asset not available
                </div>
              )}
              {component.source_asset_id && (
                <div className="mt-1 text-[9px] font-mono text-muted/70 break-all">
                  asset id: {component.source_asset_id}
                </div>
              )}
            </div>
          </div>

          {/* Stats row — actual encoded dimensions live on the card's
              badge (per the source-aspect rendering decision); no need
              to surface a "requested aspect" stat that's no longer set. */}
          <div className="grid grid-cols-3 gap-2 text-[10px]">
            <Stat label="Template" value={rs.template || "—"} />
            <Stat label="Producer" value={rs.producer_model || "—"} />
            <Stat
              label="Duration"
              value={rs.duration_seconds ? `${rs.duration_seconds}s` : "—"}
            />
          </div>

          {/* Shot direction */}
          {sd.renderPrompt && (
            <Section label="Shot direction (the prompt to the producer)">
              <p className="text-sm leading-relaxed">{sd.renderPrompt}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
                {sd.cameraMove && (
                  <span>
                    <span className="text-muted/70">camera move:</span> {sd.cameraMove}
                  </span>
                )}
                {sd.brandsMentioned && sd.brandsMentioned.length > 0 && (
                  <span>
                    <span className="text-muted/70">brands:</span>{" "}
                    {sd.brandsMentioned.join(", ")}
                  </span>
                )}
              </div>
            </Section>
          )}

          {/* Director Call provenance */}
          {director && (
            <Section label={`Director Call · ${director.model || "—"}`}>
              <details className="text-[10px] font-mono">
                <summary className="cursor-pointer text-muted hover:text-foreground">
                  Director instructions (
                  {(director.prompt || "").length.toLocaleString()} chars)
                </summary>
                <pre className="mt-2 whitespace-pre-wrap leading-relaxed bg-background p-2 rounded border border-border max-h-96 overflow-y-auto">
                  {director.prompt || "(none)"}
                </pre>
              </details>
            </Section>
          )}

          {/* Producer Call provenance */}
          {producer && (
            <Section label={`Producer Call · ${producer.model || "—"}`}>
              <p className="text-[11px] leading-relaxed font-mono">
                {producer.prompt || "(none)"}
              </p>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-background p-2">
      <div className="text-[9px] uppercase tracking-wide text-muted">{label}</div>
      <div className="text-xs">{value}</div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="mb-1.5 text-[10px] uppercase tracking-wide text-muted">
        {label}
      </div>
      {children}
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Components" requireSite>
      {({ siteId }) => <ComponentsList key={siteId} siteId={siteId} />}
    </ManagePage>
  );
}
