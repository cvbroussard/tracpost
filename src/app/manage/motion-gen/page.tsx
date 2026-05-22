"use client";

import { useEffect, useState } from "react";
import { ManagePage } from "@/components/manage/manage-page";

/**
 * Motion Gen — the still-to-motion video generator built on the director
 * pattern (project_tracpost_director_pattern). Sibling to the blog
 * Prompt Inspector, but for the two-hop video pipeline:
 *
 *   Image + analysis → Director Call (Sonnet 4.6) → the shot direction →
 *   Producer Call (Kling / Veo) → the render
 *
 * The Director is visual-only — it writes a camera move, not a story.
 * This surface assembles + shows the director instructions, runs the
 * Director Call to show the actual shot direction, and — on explicit
 * request — fires the Producer Call so you can watch that direction
 * become a video. Single-template by design, so one run fits the 300s
 * budget.
 */

const TEMPLATES = [
  { value: "reel_9x16", label: "Reel — 9:16, 5s" },
  { value: "story_9x16", label: "Story — 9:16, 5s" },
  { value: "long_16x9", label: "Long — 16:9, 10s" },
];

// Producer-model picker (Hop 2). Gemini/Veo was tested 2026-05-22 and
// pulled (scene drift: brand swap, narrative invention, no frame-to-frame
// identity, weak camera adherence). Multi-model dispatch + gemini-veo.ts
// client stay in place so the next candidate plugs in by adding a row.
const PRODUCER_MODELS = [
  { value: "kling", label: "Kling" },
  { value: "runway", label: "Runway (Gen-4 Turbo)" },
];

function producerLabel(value: string): string {
  return PRODUCER_MODELS.find((m) => m.value === value)?.label || value;
}

interface ShotDirection {
  renderPrompt: string;
  cameraMove: string;
  brandsMentioned: string[];
}

interface InspectorResponse {
  assetId: string;
  imageUrl: string;
  template: string;
  templateSpec: { label: string; durationSeconds: number; guidance: string };
  context: {
    analysis: Record<string, unknown> | null;
    brandTone: string | null;
    previousCameraMoves: string[];
  };
  directorInstructions: string;
  direction: ShotDirection | null;
  directionFailed: boolean;
  directionError?: string | null;
  producerModel?: string;
  render: { url: string; durationSeconds: number } | null;
  producerError: string | null;
}

function DirectorInspectorContent({ siteId }: { siteId: string }) {
  const [template, setTemplate] = useState("reel_9x16");
  const [seedAssetId, setSeedAssetId] = useState("");
  const [loading, setLoading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InspectorResponse | null>(null);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [producerModel, setProducerModel] = useState("kling");
  const [assets, setAssets] = useState<{ id: string; label: string }[]>([]);

  // Load the recent-analyzed list for the source picker. Re-runs on site
  // switch; failures are non-fatal — the picker just keeps the default.
  useEffect(() => {
    if (siteId === "all") {
      setAssets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/manage/motion-gen?siteId=${encodeURIComponent(siteId)}`,
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

  async function runDirector() {
    setLoading(true);
    setError(null);
    setResult(null);
    setInstructionsOpen(false);
    try {
      const res = await fetch("/api/manage/motion-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          assetId: seedAssetId || undefined,
          template,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        return;
      }
      setResult(data as InspectorResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  async function runProducer() {
    if (!result?.direction) return;
    setRendering(true);
    setError(null);
    try {
      const res = await fetch("/api/manage/motion-gen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId,
          assetId: result.assetId,
          template: result.template,
          renderPrompt: result.direction.renderPrompt,
          shotDirection: result.direction,
          producerModel,
          runProducer: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Render failed (${res.status})`);
        return;
      }
      // Merge the render result into the existing result — keep the
      // shot direction the operator reviewed on screen.
      setResult((prev) =>
        prev
          ? {
              ...prev,
              render: data.render,
              producerError: data.producerError,
              producerModel: data.producerModel,
            }
          : prev,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
    } finally {
      setRendering(false);
    }
  }

  const analysis = result?.context.analysis || {};
  const sceneType = (analysis.scene_type as string) || "";
  const description = (analysis.description as string) || "";
  const detectedVendors = Array.isArray(analysis.detected_vendors)
    ? (analysis.detected_vendors as string[])
    : [];

  return (
    <div className="p-4 space-y-4">
      {/* Controls */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card space-y-3">
        <h3 className="text-sm font-medium">Director Call</h3>
        <p className="text-[10px] text-muted leading-snug">
          Hop 1 of the director pattern. Visual-only — the Director writes a
          camera move from the image + analysis. Assembles the director
          instructions, runs the Sonnet 4.6 Director Call, and returns the
          shot direction. Hop 2 (the Producer Call) fires only when you click
          Render.
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
          <div className="col-span-2">
            <label className="block text-[10px] text-muted mb-1">
              Source asset — one of the {assets.length} most recent analyzed images
            </label>
            <select
              value={seedAssetId}
              onChange={(e) => setSeedAssetId(e.target.value)}
              disabled={loading || siteId === "all"}
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
            onClick={runDirector}
            disabled={loading || siteId === "all"}
            className="bg-accent px-3 py-1.5 text-xs font-medium text-white rounded hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Running Director Call…" : "Run Director Call"}
          </button>
          {siteId === "all" && (
            <span className="text-[10px] text-muted">Pick a site to enable.</span>
          )}
          {error && <span className="text-[10px] text-danger">{error}</span>}
        </div>
      </div>

      {result && (
        <>
          {/* Source asset + the shot direction side by side */}
          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            {/* Source still */}
            <div className="rounded-xl border border-border bg-surface p-3 shadow-card">
              <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">
                Source still
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.imageUrl}
                alt=""
                className="w-full rounded border border-border object-cover"
              />
              <div className="mt-1.5 text-[9px] font-mono text-muted break-all">
                {result.assetId}
              </div>
            </div>

            {/* The shot direction */}
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-card">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-500/20 text-emerald-400">
                  SHOT DIRECTION
                </span>
                <span className="text-[10px] text-muted">
                  {result.templateSpec.label} · {result.templateSpec.durationSeconds}s
                </span>
              </div>
              {result.directionFailed || !result.direction ? (
                <div className="space-y-1.5">
                  <div className="text-xs text-danger">
                    Director Call returned no shot direction.
                  </div>
                  {result.directionError ? (
                    <div className="rounded border border-danger/30 bg-danger/5 p-2 text-[10px] font-mono text-danger break-words">
                      {result.directionError}
                    </div>
                  ) : (
                    <div className="text-[10px] text-muted">
                      No error detail returned — check the inputs below.
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-sm leading-relaxed">
                    {result.direction.renderPrompt}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
                    <span>
                      <span className="text-emerald-400 font-mono">camera move:</span>{" "}
                      {result.direction.cameraMove || "—"}
                    </span>
                    {result.direction.brandsMentioned.length > 0 && (
                      <span>
                        <span className="text-emerald-400 font-mono">brands:</span>{" "}
                        {result.direction.brandsMentioned.join(", ")}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Director Call inputs */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card space-y-3">
            <h3 className="text-sm font-medium">Director Call inputs</h3>
            <p className="text-[10px] text-muted leading-snug">
              Visual-only. The transcript and copywriting voice traits route to
              the audio/narration layer, not the Director.
            </p>
            <div className="grid gap-3 md:grid-cols-2 text-xs">
              <InputBlock label="Analysis JSON — what's in the frame">
                {description || sceneType || detectedVendors.length > 0 ? (
                  <div className="space-y-0.5">
                    {description && <div>{description}</div>}
                    {sceneType && (
                      <div className="text-muted">scene type: {sceneType}</div>
                    )}
                    {detectedVendors.length > 0 && (
                      <div className="text-muted">
                        brands present: {detectedVendors.join(", ")}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-muted italic">(no analysis)</span>
                )}
              </InputBlock>
              <InputBlock label="Brand tone — the camera register">
                {result.context.brandTone ? (
                  result.context.brandTone
                ) : (
                  <span className="text-muted italic">
                    (no brand tone on file — neutral grounded register)
                  </span>
                )}
              </InputBlock>
              <InputBlock label="Variety constraint — camera moves already used">
                {result.context.previousCameraMoves.length > 0 ? (
                  result.context.previousCameraMoves.join(", ")
                ) : (
                  <span className="text-muted italic">
                    none yet — any camera move is open
                  </span>
                )}
              </InputBlock>
            </div>
          </div>

          {/* The assembled director instructions */}
          <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
            <button
              onClick={() => setInstructionsOpen((o) => !o)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-hover text-left"
            >
              <span className="text-sm font-medium">
                Assembled director instructions — what Sonnet 4.6 receives
              </span>
              <span className="text-xs text-muted">
                {result.directorInstructions.length.toLocaleString()} chars{" "}
                {instructionsOpen ? "▾" : "▸"}
              </span>
            </button>
            {instructionsOpen && (
              <pre className="border-t border-border bg-background p-3 text-[10px] font-mono whitespace-pre-wrap leading-relaxed max-h-[32rem] overflow-y-auto">
                {result.directorInstructions}
              </pre>
            )}
          </div>

          {/* Producer Call */}
          <div className="rounded-xl border border-border bg-surface p-4 shadow-card space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-medium">Producer Call</h3>
                <p className="text-[10px] text-muted">
                  Hop 2 — renders the shot direction above into video, up to a
                  few minutes. Render it with each model to compare outputs.
                </p>
              </div>
              <div className="flex items-end gap-2 shrink-0">
                <div>
                  <label className="block text-[10px] text-muted mb-1">Model</label>
                  <select
                    value={producerModel}
                    onChange={(e) => setProducerModel(e.target.value)}
                    disabled={rendering}
                    className="rounded border border-border bg-background px-2 py-1 text-xs disabled:opacity-50"
                  >
                    {PRODUCER_MODELS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={runProducer}
                  disabled={rendering || !result.direction}
                  className="bg-violet-600 px-3 py-1.5 text-xs font-medium text-white rounded hover:bg-violet-500 disabled:opacity-50"
                >
                  {rendering
                    ? "Rendering…"
                    : `Render with ${producerLabel(producerModel)}`}
                </button>
              </div>
            </div>
            {result.producerError && (
              <div className="text-[10px] text-danger">{result.producerError}</div>
            )}
            {result.render && (
              <div>
                {result.producerModel && (
                  <div className="mb-1 text-[10px] text-muted">
                    Rendered with {producerLabel(result.producerModel)}
                  </div>
                )}
                <video
                  src={result.render.url}
                  controls
                  className="max-h-96 rounded border border-border"
                />
                <div className="mt-1 text-[10px] font-mono text-muted break-all">
                  {result.render.url}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function InputBlock({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded border border-border bg-background p-2.5">
      <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className="leading-snug">{children}</div>
    </div>
  );
}

export default function Page() {
  return (
    <ManagePage title="Motion Gen" requireSite>
      {({ siteId }) => <DirectorInspectorContent siteId={siteId} />}
    </ManagePage>
  );
}
