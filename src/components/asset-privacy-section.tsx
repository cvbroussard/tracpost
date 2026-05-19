"use client";

/**
 * Asset privacy section — surfaces what will happen to detected faces
 * when this asset is published, per the site's adult + minor face
 * policies (three-axis settings live at /dashboard/business/content-
 * safeguards).
 *
 * Three jobs:
 *   1. Transparency — subscriber sees AI detected faces and the per-face
 *      adult/minor breakdown (per-face age estimation is imperfect; the
 *      breakdown is what triggers per-face routing)
 *   2. No-surprises publishing — they know exactly what the variant
 *      renderer will do to each face category
 *   3. Action escape hatch — when state needs attention (waiver
 *      unsigned, suppress mode, no detection ran), nudges toward the
 *      settings page or offers a manual detection trigger
 *
 * Read-only display. Per-asset overrides + per-face controls deferred.
 */

import { useEffect, useState } from "react";

interface PrivacyState {
  media_type: string;
  ai_generated: boolean;
  face_detection: {
    face_count?: number;
    faces?: Array<{
      confidence?: number;
      is_potential_minor?: boolean;
      age_low?: number;
      age_high?: number;
    }>;
    detected_at?: string;
    provider?: string;
  } | null;
  adult_face_count: number;
  minor_face_count: number;
  site_face_policy: string;
  site_face_waiver_signed_at: string | null;
  site_minor_face_policy: string;
  site_minor_face_waiver_signed_at: string | null;
  effective_face_policy: string;
  effective_minor_face_policy: string;
}

interface Props {
  assetId: string;
}

export function AssetPrivacySection({ assetId }: Props) {
  const [state, setState] = useState<PrivacyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  async function loadState() {
    try {
      const res = await fetch(`/api/assets/${assetId}/privacy`);
      if (!res.ok) return;
      const data = (await res.json()) as PrivacyState;
      setState(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/assets/${assetId}/privacy`);
        if (!res.ok) return;
        const data = (await res.json()) as PrivacyState;
        if (!cancelled) setState(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [assetId]);

  async function runDetection() {
    setDetecting(true);
    setDetectError(null);
    try {
      const res = await fetch(`/api/assets/${assetId}/detect-faces`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Detection failed (${res.status})`);
      }
      await loadState();
    } catch (e) {
      setDetectError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetecting(false);
    }
  }

  if (loading || !state) return null;

  const isImage = state.media_type?.startsWith("image");
  const isVideo = state.media_type?.startsWith("video");
  const isAi = state.ai_generated;
  const totalFaces = state.adult_face_count + state.minor_face_count;
  const hasFaces = totalFaces > 0;
  const detectionRan = state.face_detection !== null;

  if (isAi) {
    return (
      <NeutralPanel
        label="Face detection skipped — AI-generated content"
        detail={null}
      />
    );
  }

  if (isVideo) {
    return (
      <NeutralPanel
        label="Face detection skipped — video"
        detail="Video variants pass through your policy unchanged. Review before publishing."
      />
    );
  }

  if (!isImage) return null;

  if (!detectionRan) {
    return (
      <div className="mb-3 rounded border border-border bg-background px-3 py-2 text-[11px]">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted/70">
          <span>🔒</span>
          <span>Privacy</span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex-1">
            <div className="font-medium text-foreground">Face detection hasn&apos;t run yet</div>
            {detectError && <div className="mt-0.5 text-danger">{detectError}</div>}
          </div>
          <button
            onClick={runDetection}
            disabled={detecting}
            className="shrink-0 rounded bg-accent px-2 py-1 text-[10px] font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {detecting ? "Detecting…" : "Run detection"}
          </button>
        </div>
      </div>
    );
  }

  if (!hasFaces) {
    return <NeutralPanel label="No faces detected" detail={null} />;
  }

  // Faces present — describe what each axis will do, with the minor
  // axis getting its own line + accent treatment when minors are present.
  const adultLine = state.adult_face_count > 0
    ? describePolicyLine(
        state.adult_face_count,
        "adult",
        state.site_face_policy,
        state.effective_face_policy,
        Boolean(state.site_face_waiver_signed_at),
      )
    : null;

  const minorLine = state.minor_face_count > 0
    ? describePolicyLine(
        state.minor_face_count,
        "minor",
        state.site_minor_face_policy,
        state.effective_minor_face_policy,
        Boolean(state.site_minor_face_waiver_signed_at),
      )
    : null;

  // Tone elevates when minors are detected OR any axis is in a warning
  // state (fall-back or suppress).
  const anyWarning =
    Boolean(adultLine?.warning) ||
    Boolean(minorLine?.warning) ||
    state.minor_face_count > 0;

  const containerClass = anyWarning
    ? "mb-3 rounded border border-warning/40 bg-warning/5 px-3 py-2 text-[11px]"
    : "mb-3 rounded border border-border bg-background px-3 py-2 text-[11px]";

  return (
    <div className={containerClass}>
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted/70">
        <span>{anyWarning ? "⚠️" : "🔒"}</span>
        <span>Privacy</span>
      </div>
      <div className="space-y-1.5">
        <div className="font-medium text-foreground">
          {totalFaces} face{totalFaces === 1 ? "" : "s"} detected
          {state.minor_face_count > 0 && (
            <span className="ml-1.5 rounded bg-warning/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-warning">
              {state.minor_face_count} potential minor
              {state.minor_face_count === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {adultLine && (
          <div className="text-muted">
            <span className="text-foreground/80">Adults:</span> {adultLine.text}
          </div>
        )}
        {minorLine && (
          <div className="text-muted">
            <span className="text-foreground/80">Potential minors:</span> {minorLine.text}
          </div>
        )}
      </div>
      <div className="mt-2 flex justify-end">
        <a
          href="/dashboard/business/content-safeguards"
          className="text-[10px] text-accent hover:underline"
        >
          {anyWarning ? "Review settings →" : "Settings →"}
        </a>
      </div>
    </div>
  );
}

function NeutralPanel({ label, detail }: { label: string; detail: string | null }) {
  return (
    <div className="mb-3 rounded border border-border bg-background px-3 py-2 text-[11px]">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted/70">
        <span>🔒</span>
        <span>Privacy</span>
      </div>
      <div className="font-medium text-foreground">{label}</div>
      {detail && <div className="mt-0.5 text-muted">{detail}</div>}
    </div>
  );
}

/**
 * Translate (stored policy, waiver state) into a one-line description
 * of what the renderer will do, plus a warning flag for the modal's
 * elevated-tone styling. Mirrors the resolution logic in
 * face-transforms.ts so the modal's description stays in lockstep with
 * actual render behavior.
 */
function describePolicyLine(
  count: number,
  axis: "adult" | "minor",
  storedPolicy: string,
  effectivePolicy: string,
  waiverSigned: boolean,
): { text: string; warning: boolean } {
  const noun = count === 1 ? "face" : "faces";

  if (storedPolicy === "asis" && !waiverSigned) {
    return {
      text: `will publish blurred — you chose as-is but the ${axis} face waiver isn't signed`,
      warning: true,
    };
  }
  switch (effectivePolicy) {
    case "asis":
      return { text: `will publish unaltered (${noun}, waiver signed)`, warning: false };
    case "suppress":
      return {
        text: `will NOT auto-publish (${axis} ${noun} present, policy=suppress)`,
        warning: true,
      };
    case "box":
      return { text: `will publish with rectangle overlay`, warning: false };
    case "blur":
    default:
      return { text: `will publish blurred (site default)`, warning: false };
  }
}
