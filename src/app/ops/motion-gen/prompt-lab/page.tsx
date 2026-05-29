"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ManagePage } from "@/components/manage/manage-page";

/**
 * Prompt Lab — Motion Gen's prompt-experiment surface. Render N camera-move
 * prompt variants against the same source asset for side-by-side comparison.
 *
 * Each variant fires the existing /api/ops/motion-gen POST with renderPrompt
 * set, which skips the Director Call and renders the operator's exact prompt
 * verbatim through the chosen producer. Variants land as media_components
 * (full provenance via production_events) just like single Motion Gen runs;
 * the lab is purely an orchestration + comparison surface on top.
 *
 * Designed for prompt-craft iteration on TracPost's actual content distribution
 * (worker close-ups, job-site stills, completed-project exteriors) — the
 * highest-leverage path to production-quality renders per the producer
 * evaluation memory.
 */

const TEMPLATES = [
  { value: "reel_9x16", label: "Reel — 5s, punchy" },
  { value: "story_9x16", label: "Story — 5s, atmospheric" },
  { value: "long_16x9", label: "Long — 10s, documentary" },
];

const PRODUCER_MODELS = [
  { value: "kling", label: "Kling" },
  { value: "runway", label: "Runway (Gen-4 Turbo)" },
];

const MAX_VARIANTS = 6;
const DEFAULT_VARIANT_COUNT = 3;

interface AssetOption {
  id: string;
  label: string;
}

type VariantStatus = "idle" | "rendering" | "done" | "failed";

interface Variant {
  id: string;
  label: string;
  cameraMove: string;
  prompt: string;
  status: VariantStatus;
  render?: { url: string; durationSeconds: number };
  error?: string;
}

function clientId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function newVariant(index: number): Variant {
  return {
    id: clientId(),
    label: `Variant ${index + 1}`,
    cameraMove: "",
    prompt: "",
    status: "idle",
  };
}

function PromptLabContent({ siteId }: { siteId: string }) {
  const [seedAssetId, setSeedAssetId] = useState("");
  const [template, setTemplate] = useState("reel_9x16");
  const [producerModel, setProducerModel] = useState("kling");
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [variants, setVariants] = useState<Variant[]>(() =>
    Array.from({ length: DEFAULT_VARIANT_COUNT }, (_, i) => newVariant(i)),
  );

  // Reuse the existing motion-gen GET endpoint — same recent-analyzed list,
  // same order, same "first row = most-recent" semantics.
  useEffect(() => {
    if (siteId === "all") {
      setAssets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/ops/motion-gen?siteId=${encodeURIComponent(siteId)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.assets)) setAssets(data.assets);
      } catch {
        /* non-fatal */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  function patchVariant(id: string, patch: Partial<Variant>) {
    setVariants((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  }

  function addVariant() {
    if (variants.length >= MAX_VARIANTS) return;
    setVariants((vs) => [...vs, newVariant(vs.length)]);
  }

  function removeVariant(id: string) {
    setVariants((vs) => (vs.length > 1 ? vs.filter((v) => v.id !== id) : vs));
  }

  async function renderVariant(id: string) {
    const v = variants.find((x) => x.id === id);
    if (!v || !v.prompt.trim()) return;
    patchVariant(id, { status: "rendering", error: undefined, render: undefined });
    try {
      const res = await fetch("/api/ops/motion-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          assetId: seedAssetId || undefined,
          template,
          renderPrompt: v.prompt.trim(),
          shotDirection: {
            renderPrompt: v.prompt.trim(),
            cameraMove: v.cameraMove.trim() || null,
            brandsMentioned: [],
          },
          producerModel,
          runProducer: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        patchVariant(id, {
          status: "failed",
          error: data.error || `Render failed (${res.status})`,
        });
        return;
      }
      if (data.producerError) {
        patchVariant(id, { status: "failed", error: data.producerError });
        return;
      }
      if (!data.render) {
        patchVariant(id, { status: "failed", error: "Producer returned no render" });
        return;
      }
      patchVariant(id, { status: "done", render: data.render });
    } catch (e) {
      patchVariant(id, {
        status: "failed",
        error: e instanceof Error ? e.message : "Render failed",
      });
    }
  }

  // Parallel — each variant call is independent; the existing motion-gen
  // endpoint serializes nothing on its end either. Wall-clock is ~max
  // single-render time rather than sum.
  async function renderAll() {
    const renderable = variants.filter(
      (v) => v.prompt.trim() && v.status !== "rendering",
    );
    await Promise.all(renderable.map((v) => renderVariant(v.id)));
  }

  const renderableCount = variants.filter(
    (v) => v.prompt.trim() && v.status !== "rendering",
  ).length;
  const anyRendering = variants.some((v) => v.status === "rendering");
  const completed = variants.filter((v) => v.status === "done" && v.render);

  const resultCols =
    completed.length <= 1
      ? "md:grid-cols-1"
      : completed.length === 2
        ? "md:grid-cols-2"
        : completed.length === 4
          ? "md:grid-cols-2"
          : "md:grid-cols-3";

  return (
    <div className="p-4 space-y-4">
      <div className="text-[10px] text-muted">
        <Link href="/ops/motion-gen" className="text-accent hover:underline">
          ← Motion Gen
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-card space-y-3">
        <h3 className="text-sm font-medium">Prompt Lab</h3>
        <p className="text-[10px] text-muted leading-snug">
          Render N camera-move prompt variants against the same source asset for
          side-by-side comparison. Each variant fires the Producer Call directly,
          skipping the Director Call — prompts are sent to the producer verbatim.
          Use this to A/B test camera-move vocabulary, prompt structure, and
          producer-specific phrasing on your own content distribution. Up to{" "}
          {MAX_VARIANTS} variants per session.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] text-muted mb-1">Template</label>
            <select
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
            >
              {TEMPLATES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-1">Producer</label>
            <select
              value={producerModel}
              onChange={(e) => setProducerModel(e.target.value)}
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
            >
              {PRODUCER_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-1">
              Source asset — shared across all variants
            </label>
            <select
              value={seedAssetId}
              onChange={(e) => setSeedAssetId(e.target.value)}
              disabled={siteId === "all"}
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
            >
              <option value="">Most recent analyzed image</option>
              {assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={renderAll}
            disabled={anyRendering || renderableCount === 0 || siteId === "all"}
            className="bg-violet-600 px-3 py-1.5 text-xs font-medium text-white rounded hover:bg-violet-500 disabled:opacity-50"
          >
            {anyRendering ? "Rendering…" : `Render all (${renderableCount})`}
          </button>
          <button
            onClick={addVariant}
            disabled={variants.length >= MAX_VARIANTS}
            className="rounded border border-border bg-surface-hover px-3 py-1.5 text-xs hover:bg-surface disabled:opacity-50"
          >
            + Add variant ({variants.length}/{MAX_VARIANTS})
          </button>
          {siteId === "all" && (
            <span className="text-[10px] text-muted">Pick a site to enable.</span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {variants.map((v) => (
          <VariantRow
            key={v.id}
            variant={v}
            canRemove={variants.length > 1}
            onChange={(patch) => patchVariant(v.id, patch)}
            onRemove={() => removeVariant(v.id)}
            onRender={() => renderVariant(v.id)}
            disabled={siteId === "all"}
          />
        ))}
      </div>

      {completed.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card space-y-3">
          <h3 className="text-sm font-medium">
            Results — {completed.length} render{completed.length === 1 ? "" : "s"}
          </h3>
          <div className={`grid gap-3 grid-cols-1 ${resultCols}`}>
            {completed.map((v) => (
              <div
                key={v.id}
                className="rounded border border-border bg-background p-3 space-y-2"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span className="uppercase tracking-wide text-muted">{v.label}</span>
                  {v.render && (
                    <span className="font-mono text-muted">
                      {v.render.durationSeconds}s
                    </span>
                  )}
                </div>
                <video
                  src={v.render!.url}
                  controls
                  autoPlay
                  muted
                  loop
                  preload="metadata"
                  className="w-full rounded bg-black"
                />
                {v.cameraMove && (
                  <div className="text-[10px]">
                    <span className="text-muted">camera move:</span> {v.cameraMove}
                  </div>
                )}
                <p className="text-[11px] leading-snug text-muted/90">{v.prompt}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VariantRow({
  variant,
  canRemove,
  onChange,
  onRemove,
  onRender,
  disabled,
}: {
  variant: Variant;
  canRemove: boolean;
  onChange: (patch: Partial<Variant>) => void;
  onRemove: () => void;
  onRender: () => void;
  disabled: boolean;
}) {
  const isRendering = variant.status === "rendering";
  const canRender = variant.prompt.trim().length > 0 && !isRendering && !disabled;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{variant.label}</span>
          <StatusBadge status={variant.status} />
        </div>
        {canRemove && (
          <button
            onClick={onRemove}
            disabled={isRendering}
            className="text-[10px] text-muted hover:text-danger disabled:opacity-50"
          >
            remove
          </button>
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
        <div className="space-y-2">
          <input
            value={variant.cameraMove}
            onChange={(e) => onChange({ cameraMove: e.target.value })}
            disabled={isRendering}
            placeholder="Camera move label (optional, e.g. 'slow dolly in')"
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs"
          />
          <textarea
            value={variant.prompt}
            onChange={(e) => onChange({ prompt: e.target.value })}
            disabled={isRendering}
            placeholder="Camera-move prompt sent to the producer verbatim…"
            rows={3}
            className="w-full rounded border border-border bg-background px-2 py-1 text-xs font-mono leading-relaxed"
          />
        </div>
        <button
          onClick={onRender}
          disabled={!canRender}
          className="bg-violet-600 px-3 py-1.5 text-xs font-medium text-white rounded hover:bg-violet-500 disabled:opacity-50 whitespace-nowrap"
        >
          {isRendering
            ? "Rendering…"
            : variant.status === "done"
              ? "Re-render"
              : "Render"}
        </button>
      </div>
      {variant.error && (
        <div className="mt-2 text-[10px] text-danger">{variant.error}</div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: VariantStatus }) {
  const map: Record<VariantStatus, { label: string; cls: string }> = {
    idle: { label: "idle", cls: "bg-muted/20 text-muted" },
    rendering: { label: "rendering", cls: "bg-violet-500/20 text-violet-400" },
    done: { label: "done", cls: "bg-emerald-500/20 text-emerald-400" },
    failed: { label: "failed", cls: "bg-rose-500/20 text-rose-400" },
  };
  const s = map[status];
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide ${s.cls}`}
    >
      {s.label}
    </span>
  );
}

export default function Page() {
  return (
    <ManagePage title="Prompt Lab" requireSite>
      {({ siteId }) => <PromptLabContent siteId={siteId} />}
    </ManagePage>
  );
}
