"use client";

import { useEffect, useMemo, useState } from "react";

interface Subject {
  subject_class: string;
  subject_geometry: [number, number, number, number];
  confidence: number;
}

interface Detection {
  outcome: "anchored" | "unanchored";
  focal_point: { x: number; y: number } | null;
  subjects: Subject[];
  runtime_ms: number;
  model_version: string;
  detected_at: string;
  image_dimensions: { width: number; height: number };
}

interface InspectorResponse {
  source: { assetId: string; url: string; mediaType: string };
  detection: Detection;
  wireTimeMs: number;
}

type Verdict = "correct" | "wrong_subject" | "correct_no_subject" | "missed_subject";

const ASPECTS = [
  { label: "1:1", w: 1, h: 1, color: "#22d3ee" },
  { label: "4:5", w: 4, h: 5, color: "#a78bfa" },
  { label: "2:3", w: 2, h: 3, color: "#fb923c" },
  { label: "9:16", w: 9, h: 16, color: "#f472b6" },
  { label: "16:9", w: 16, h: 9, color: "#34d399" },
] as const;

function subjectArea(s: Subject): number {
  const [x1, y1, x2, y2] = s.subject_geometry;
  return (x2 - x1) * (y2 - y1);
}

function subjectCentroid(s: Subject): { cx: number; cy: number } {
  const [x1, y1, x2, y2] = s.subject_geometry;
  return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
}

export function FocalPointInspectorModal({
  assetId,
  onClose,
}: {
  assetId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<InspectorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  // -1 = use the algorithmic focal point; >=0 = preview crops anchored on subject[i]
  const [activeIdx, setActiveIdx] = useState<number>(-1);
  // null = show all 5 aspect crops; string = isolate one aspect with a dim
  // overlay on the cropped-out region.
  const [isolatedAspect, setIsolatedAspect] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/manage/focal-point/${assetId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) setError(body.error || `fetch failed (${res.status})`);
          return;
        }
        const json: InspectorResponse = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "fetch failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  // Largest subject by pixel area = the algorithmic anchor (matches the
  // server-side "largest wins" rule). Index used to highlight the default dot.
  const algorithmicIdx = useMemo(() => {
    if (!data || data.detection.subjects.length === 0) return -1;
    return data.detection.subjects.reduce(
      (maxI, s, i, arr) => (subjectArea(s) > subjectArea(arr[maxI]) ? i : maxI),
      0,
    );
  }, [data]);

  // The focal point that crop boxes are drawn around. Normalized 0..1 coords.
  const previewFocal = useMemo(() => {
    if (!data) return null;
    const { subjects, image_dimensions: dim, outcome, focal_point } = data.detection;
    // Active = user-selected subject preview
    if (activeIdx >= 0 && subjects[activeIdx]) {
      const { cx, cy } = subjectCentroid(subjects[activeIdx]);
      return { x: cx / dim.width, y: cy / dim.height };
    }
    // Default = algorithmic outcome
    if (outcome === "anchored" && focal_point) return focal_point;
    return { x: 0.5, y: 0.5 }; // unanchored → gravity=center
  }, [data, activeIdx]);

  const handleVerdict = (verdict: Verdict) => {
    // v1: log to console. Will write to detection_verdicts (#237) once schema ships.
    console.log("[focal-point verdict]", {
      assetId,
      verdict,
      outcome: data?.detection.outcome,
      model_version: data?.detection.model_version,
      activeSubject: activeIdx >= 0 ? data?.detection.subjects[activeIdx] : null,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-6xl my-8 rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-20 rounded border border-border bg-surface/90 px-2 py-1 text-xs hover:bg-surface"
        >
          Close
        </button>

        <div className="p-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold">Focal-point inspector</h2>
            <span className="text-[10px] text-muted font-mono">{assetId.slice(0, 8)}…</span>
          </div>

          {error && (
            <div className="rounded border border-danger bg-danger/10 p-4 text-sm text-danger">
              {error}
            </div>
          )}

          {!data && !error && (
            <div className="flex flex-col items-center justify-center py-20 text-muted">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              <p className="mt-3 text-xs">Running detection on Modal…</p>
              <p className="mt-1 text-[10px] text-muted/70">First request after redeploy can take 5–10s.</p>
            </div>
          )}

          {data && previewFocal && (
            <div className="grid gap-5 md:grid-cols-[1fr_18rem]">
              <div className="space-y-3">
                <ImageWithOverlay
                  data={data}
                  previewFocal={previewFocal}
                  activeIdx={activeIdx}
                  algorithmicIdx={algorithmicIdx}
                  isolatedAspect={isolatedAspect}
                  onSubjectClick={(i) => setActiveIdx(activeIdx === i ? -1 : i)}
                />
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  <span className="text-muted">
                    Aspects: {isolatedAspect ? "(click again to show all)" : "(click to isolate)"}
                  </span>
                  {ASPECTS.map((a) => {
                    const isIsolated = isolatedAspect === a.label;
                    const isDimmed = isolatedAspect !== null && !isIsolated;
                    return (
                      <button
                        key={a.label}
                        onClick={() => setIsolatedAspect(isIsolated ? null : a.label)}
                        className={`rounded border px-1.5 py-0.5 font-mono transition ${
                          isDimmed ? "opacity-30" : ""
                        }`}
                        style={
                          isIsolated
                            ? { backgroundColor: a.color, color: "#000", borderColor: a.color }
                            : { borderColor: a.color, color: a.color }
                        }
                      >
                        {a.label}
                      </button>
                    );
                  })}
                  {activeIdx >= 0 && (
                    <button
                      onClick={() => setActiveIdx(-1)}
                      className="ml-auto rounded border border-accent px-2 py-0.5 text-[10px] text-accent hover:bg-accent/10"
                    >
                      ← reset to algorithmic pick
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4 text-xs">
                <div className="rounded border border-border bg-background p-3">
                  <div className="text-[9px] uppercase tracking-wide text-muted">Outcome</div>
                  <div
                    className={`mt-1 text-base font-semibold ${
                      data.detection.outcome === "anchored" ? "text-emerald-400" : "text-amber-400"
                    }`}
                  >
                    {data.detection.outcome}
                  </div>
                  {data.detection.outcome === "anchored" && data.detection.focal_point && (
                    <div className="mt-1 text-[10px] font-mono text-muted">
                      ({data.detection.focal_point.x.toFixed(3)}, {data.detection.focal_point.y.toFixed(3)})
                    </div>
                  )}
                  {data.detection.outcome === "unanchored" && (
                    <div className="mt-1 text-[10px] text-muted">
                      Equal-weight canvas → gravity=center
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-1 text-[9px] uppercase tracking-wide text-muted">
                    Subjects ({data.detection.subjects.length})
                  </div>
                  {data.detection.subjects.length === 0 && (
                    <div className="text-[10px] italic text-muted">No subjects above threshold.</div>
                  )}
                  <ul className="space-y-1">
                    {data.detection.subjects.map((s, i) => {
                      const area = subjectArea(s);
                      const isAlgo = i === algorithmicIdx;
                      const isActive = i === activeIdx;
                      return (
                        <li
                          key={i}
                          onClick={() => setActiveIdx(isActive ? -1 : i)}
                          className={`cursor-pointer rounded border p-2 transition ${
                            isActive
                              ? "border-amber-400 bg-amber-400/10"
                              : isAlgo && activeIdx === -1
                                ? "border-emerald-400 bg-emerald-400/5"
                                : "border-border bg-background hover:border-accent/50"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono">{s.subject_class}</span>
                            <span className="text-muted">{Math.round(s.confidence * 100)}%</span>
                          </div>
                          <div className="mt-0.5 flex justify-between text-[9px] text-muted">
                            <span>{Math.round(area).toLocaleString()} px²</span>
                            {isAlgo && activeIdx === -1 && (
                              <span className="text-emerald-400">★ algorithmic pick</span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                <div className="rounded border border-border bg-background p-2 space-y-1 text-[10px] font-mono">
                  <Row label="model" value={data.detection.model_version} />
                  <Row label="runtime" value={`${data.detection.runtime_ms} ms`} />
                  <Row label="wire" value={`${data.wireTimeMs} ms`} />
                  <Row
                    label="dims"
                    value={`${data.detection.image_dimensions.width}×${data.detection.image_dimensions.height}`}
                  />
                </div>
              </div>
            </div>
          )}

          {data && (
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 text-[10px] uppercase tracking-wide text-muted">
                Verdict — logs to console (writes to detection_verdicts table once #237 ships)
              </div>
              <div className="flex flex-wrap gap-2">
                {data.detection.outcome === "anchored" ? (
                  <>
                    <VerdictButton tone="emerald" onClick={() => handleVerdict("correct")}>
                      ✓ Correct subject
                    </VerdictButton>
                    <VerdictButton tone="rose" onClick={() => handleVerdict("wrong_subject")}>
                      ✗ Wrong subject
                    </VerdictButton>
                  </>
                ) : (
                  <>
                    <VerdictButton tone="emerald" onClick={() => handleVerdict("correct_no_subject")}>
                      ✓ Correct: no subject
                    </VerdictButton>
                    <VerdictButton tone="amber" onClick={() => handleVerdict("missed_subject")}>
                      ✗ Missed subject
                    </VerdictButton>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}

function VerdictButton({
  tone,
  children,
  onClick,
}: {
  tone: "emerald" | "rose" | "amber";
  children: React.ReactNode;
  onClick: () => void;
}) {
  const toneClasses: Record<typeof tone, string> = {
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20",
    rose: "border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
  };
  return (
    <button onClick={onClick} className={`rounded border px-3 py-2 text-xs ${toneClasses[tone]}`}>
      {children}
    </button>
  );
}

function ImageWithOverlay({
  data,
  previewFocal,
  activeIdx,
  algorithmicIdx,
  isolatedAspect,
  onSubjectClick,
}: {
  data: InspectorResponse;
  previewFocal: { x: number; y: number };
  activeIdx: number;
  algorithmicIdx: number;
  isolatedAspect: string | null;
  onSubjectClick: (i: number) => void;
}) {
  const { width: srcW, height: srcH } = data.detection.image_dimensions;
  const sourceRatio = srcW / srcH;
  const stroke = Math.max(2, srcW / 300);
  const dotRadius = srcW / 90;

  const crops = ASPECTS
    .filter((a) => isolatedAspect === null || isolatedAspect === a.label)
    .map((a) => {
      const target = a.w / a.h;
      const cropW = sourceRatio > target ? srcH * target : srcW;
      const cropH = sourceRatio > target ? srcH : srcW / target;
      const cxPx = previewFocal.x * srcW;
      const cyPx = previewFocal.y * srcH;
      const x = Math.max(0, Math.min(cxPx - cropW / 2, srcW - cropW));
      const y = Math.max(0, Math.min(cyPx - cropH / 2, srcH - cropH));
      return { ...a, x, y, w: cropW, h: cropH };
    });

  // When isolated, build a "donut" path: outer rect = full image, inner
  // rect = the crop hole. fill-rule="evenodd" makes the inner area transparent
  // so the crop region remains fully visible while everything outside is dimmed.
  const dimPath =
    isolatedAspect && crops.length === 1
      ? `M 0 0 H ${srcW} V ${srcH} H 0 Z M ${crops[0].x} ${crops[0].y} H ${crops[0].x + crops[0].w} V ${crops[0].y + crops[0].h} H ${crops[0].x} Z`
      : null;

  return (
    <div className="relative w-full" style={{ aspectRatio: `${srcW} / ${srcH}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={data.source.url}
        alt=""
        className="absolute inset-0 h-full w-full object-contain bg-black"
      />

      {/* Crop-rect layer — passive, no pointer events */}
      <svg
        viewBox={`0 0 ${srcW} ${srcH}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full pointer-events-none"
      >
        {dimPath && (
          <path d={dimPath} fill="rgba(0,0,0,0.7)" fillRule="evenodd" />
        )}
        {crops.map((c) => (
          <g key={c.label}>
            <rect
              x={c.x}
              y={c.y}
              width={c.w}
              height={c.h}
              fill="none"
              stroke={c.color}
              strokeWidth={stroke}
              strokeDasharray={`${srcW / 80} ${srcW / 130}`}
            />
            <rect
              x={c.x + stroke * 2}
              y={c.y + stroke * 2}
              width={srcW / 14}
              height={srcW / 32}
              fill={c.color}
              opacity={0.9}
            />
            <text
              x={c.x + stroke * 2 + srcW / 28}
              y={c.y + stroke * 2 + srcW / 64}
              fontFamily="monospace"
              fontSize={srcW / 55}
              fontWeight={700}
              fill="#000"
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {c.label}
            </text>
          </g>
        ))}
      </svg>

      {/* Subject + focal dot layer — clickable */}
      <svg viewBox={`0 0 ${srcW} ${srcH}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {data.detection.subjects.map((s, i) => {
          const { cx, cy } = subjectCentroid(s);
          const isAlgo = i === algorithmicIdx && activeIdx === -1;
          const isActive = i === activeIdx;
          const color = isActive ? "#fbbf24" : isAlgo ? "#34d399" : "#ffffff";
          const r = isActive || isAlgo ? dotRadius * 1.4 : dotRadius;
          return (
            <g key={i} onClick={() => onSubjectClick(i)} style={{ cursor: "pointer" }}>
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={color}
                stroke="#000"
                strokeWidth={Math.max(2, srcW / 500)}
                opacity={0.95}
              />
            </g>
          );
        })}

        {/* Unanchored: render a dot at gravity=center to show what's anchoring the crops. */}
        {data.detection.outcome === "unanchored" && (
          <circle
            cx={srcW / 2}
            cy={srcH / 2}
            r={dotRadius}
            fill="#fbbf24"
            stroke="#000"
            strokeWidth={Math.max(2, srcW / 500)}
            opacity={0.7}
          />
        )}
      </svg>
    </div>
  );
}
