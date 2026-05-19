"use client";

/**
 * Asset privacy section — surfaces what will happen to detected faces
 * when this asset is published, per the site's face_policy.
 *
 * Three jobs (per 2026-05-19 design):
 *   1. Transparency — subscriber sees that AI detected faces
 *   2. No-surprises publishing — they know exactly what the published
 *      variant will look like
 *   3. Action escape hatch — when state is weird (waiver unsigned,
 *      suppress mode), nudges toward the settings page
 *
 * Read-only in v1. Per-asset overrides + per-face controls deferred.
 * Subscriber changes policy at /dashboard/business/privacy; this
 * surface just reflects what's configured.
 *
 * Renders nothing while loading or when there's nothing meaningful to
 * say (asset hasn't been face-detected yet — could be a brand-new
 * upload still waiting on the async waitUntil).
 */

import { useEffect, useState } from "react";

interface PrivacyState {
  media_type: string;
  ai_generated: boolean;
  face_detection: {
    face_count?: number;
    faces?: unknown[];
    detected_at?: string;
    provider?: string;
  } | null;
  site_face_policy: string;
  site_face_waiver_signed_at: string | null;
  effective_face_policy: string;
}

interface Props {
  assetId: string;
}

export function AssetPrivacySection({ assetId }: Props) {
  const [state, setState] = useState<PrivacyState | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading || !state) return null;

  const isImage = state.media_type?.startsWith("image");
  const isVideo = state.media_type?.startsWith("video");
  const isAi = state.ai_generated;
  const facesPresent = (state.face_detection?.face_count ?? 0) > 0;
  const detectionRan = state.face_detection !== null;

  // Choose scenario + treatment
  let label: string;
  let detail: string | null = null;
  let tone: "neutral" | "warning" = "neutral";
  let showSettingsLink = false;
  let showWaiverLink = false;

  if (isAi) {
    label = "Face detection skipped — AI-generated content";
    detail = null;
  } else if (isVideo) {
    label = "Face detection skipped — video";
    detail = "Video variants pass through your policy unchanged. Review before publishing.";
  } else if (!isImage) {
    // Audio, PDF, other — skip the section entirely
    return null;
  } else if (!detectionRan) {
    // Asset is an image but detection metadata isn't there yet (pending
    // async waitUntil OR failed silently). Hide rather than show a
    // misleading "no faces" message.
    return null;
  } else if (!facesPresent) {
    label = "No faces detected";
    detail = null;
  } else {
    // Faces present — branch on effective policy + waiver state
    const count = state.face_detection?.face_count ?? 0;
    const noun = count === 1 ? "face" : "faces";
    const policyChoseAsis = state.site_face_policy === "asis";
    const waiverSigned = Boolean(state.site_face_waiver_signed_at);
    const effective = state.effective_face_policy;

    if (policyChoseAsis && !waiverSigned) {
      // Subscriber wants as-is but hasn't signed → fall-back-to-blur
      label = `${count} ${noun} detected`;
      detail = "Will publish: blurred (you chose as-is but haven't signed the waiver)";
      tone = "warning";
      showWaiverLink = true;
    } else if (effective === "asis") {
      label = `${count} ${noun} detected`;
      detail = "Will publish: as-is (waiver signed)";
      showSettingsLink = true;
    } else if (effective === "suppress") {
      label = `${count} ${noun} detected`;
      detail = "Will NOT auto-publish (your policy suppresses face assets)";
      tone = "warning";
      showSettingsLink = true;
    } else if (effective === "box") {
      label = `${count} ${noun} detected`;
      detail = "Will publish: rectangle overlay (site default)";
      showSettingsLink = true;
    } else {
      // blur
      label = `${count} ${noun} detected`;
      detail = "Will publish: blurred (site default)";
      showSettingsLink = true;
    }
  }

  const containerClass =
    tone === "warning"
      ? "mb-3 rounded border border-warning/40 bg-warning/5 px-3 py-2 text-[11px]"
      : "mb-3 rounded border border-border bg-background px-3 py-2 text-[11px]";

  return (
    <div className={containerClass}>
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted/70">
        <span>{tone === "warning" ? "⚠️" : "🔒"}</span>
        <span>Privacy</span>
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex-1">
          <div className="font-medium text-foreground">{label}</div>
          {detail && <div className="mt-0.5 text-muted">{detail}</div>}
        </div>
        {(showSettingsLink || showWaiverLink) && (
          <a
            href="/dashboard/business/privacy"
            className="shrink-0 text-[10px] text-accent hover:underline"
          >
            {showWaiverLink ? "Sign waiver →" : "Settings →"}
          </a>
        )}
      </div>
    </div>
  );
}
