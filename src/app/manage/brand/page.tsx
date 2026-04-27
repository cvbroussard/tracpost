"use client";

import { useState, useEffect, useCallback } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { BrandPlaybookView } from "@/app/dashboard/brand/brand-playbook-view";
import { GeneratePlaybookButton } from "@/app/dashboard/brand/generate-playbook-button";
import { toast, confirm } from "@/components/feedback";

interface BrandData {
  siteId: string;
  siteName: string;
  url: string | null;
  businessType: string;
  location: string;
  hasPlaybook: boolean;
  playbook: Record<string, unknown>;
  subscriberAngle: string | null;
}

interface DnaState {
  score: {
    score: number;
    tier: "minimal" | "moderate" | "rich";
    breakdown: {
      qualityCaptions: { count: number; score: number; weight: number };
      positiveReviews: { count: number; score: number; weight: number };
      gbpProfile: { score: number; weight: number; fieldsPresent: string[] };
      voiceConsistency: { score: number; weight: number; cv: number | null; captionsAnalyzed: number };
    };
  };
  dna: {
    playbook: Record<string, unknown>;
    signals: Record<string, unknown> | null;
    generated_at: string;
    version: string;
    subscriber_angle?: string;
  } | null;
  activeSource: "playbook" | "dna";
}

const TIER_COLOR: Record<string, string> = {
  minimal: "bg-muted/20 text-muted",
  moderate: "bg-warning/10 text-warning",
  rich: "bg-success/10 text-success",
};

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function BrandContent({ siteId }: { siteId: string }) {
  const [data, setData] = useState<BrandData | null>(null);
  const [dnaState, setDnaState] = useState<DnaState | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [activating, setActivating] = useState(false);
  const [sharpenAngle, setSharpenAngle] = useState("");
  const [sharpening, setSharpening] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [brandRes, dnaRes] = await Promise.all([
        fetch(`/api/manage/brand?site_id=${siteId}`).then(r => r.ok ? r.json() : null),
        fetch(`/api/admin/brand-dna/compare?siteId=${siteId}`).then(r => r.ok ? r.json() : null),
      ]);
      if (brandRes) setData(brandRes);
      if (dnaRes) {
        setDnaState(dnaRes);
        if (dnaRes.dna?.subscriber_angle) setSharpenAngle(dnaRes.dna.subscriber_angle);
      }
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function generateOrRegenerate(force = false) {
    if (force) {
      const ok = await confirm({
        title: "Regenerate Brand DNA?",
        body: "Re-extracts signals and re-generates the playbook (~$0.15, 30-90s). Overwrites the cached envelope.",
        confirmLabel: "Regenerate",
      });
      if (!ok) return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/admin/brand-dna/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, force }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(force ? "Brand DNA regenerated" : "Brand DNA generated");
        await loadAll();
      } else {
        toast.error(`Failed: ${d.error || "unknown"}`);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function activate(source: "playbook" | "dna") {
    const ok = await confirm({
      title: source === "dna" ? "Activate Brand DNA?" : "Revert to Brand Playbook?",
      body: source === "dna"
        ? "Brand DNA becomes the active source for downstream content generation."
        : "Brand Playbook becomes the active source.",
      confirmLabel: source === "dna" ? "Activate Brand DNA" : "Revert",
    });
    if (!ok) return;
    setActivating(true);
    try {
      const res = await fetch("/api/admin/brand-dna/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, source }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success(source === "dna" ? "Brand DNA active" : "Brand Playbook active");
        setDnaState(prev => prev ? { ...prev, activeSource: source } : prev);
      } else {
        toast.error(`Failed: ${d.error || "unknown"}`);
      }
    } finally {
      setActivating(false);
    }
  }

  async function sharpen() {
    if (!sharpenAngle.trim()) return;
    setSharpening(true);
    try {
      const res = await fetch("/api/admin/brand-dna/sharpen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, angle: sharpenAngle.trim() }),
      });
      const d = await res.json();
      if (res.ok) {
        toast.success("Brand DNA sharpened around your angle");
        await loadAll();
      } else {
        toast.error(`Failed: ${d.error || "unknown"}`);
      }
    } finally {
      setSharpening(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!data) {
    return <p className="p-6 text-xs text-muted">Failed to load brand data.</p>;
  }

  const score = dnaState?.score;
  const dna = dnaState?.dna;
  const activeSource = dnaState?.activeSource || "playbook";

  return (
    <div className="p-4 space-y-4 pb-12">
      {/* Score banner — tier + breakdown + active source */}
      {score && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-xs font-semibold">Signal Sufficiency</h3>
            <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${TIER_COLOR[score.tier]}`}>
              {score.tier} · score {score.score}
            </span>
            <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${activeSource === "dna" ? "bg-accent/10 text-accent" : "bg-surface-hover text-foreground"}`}>
              active: {activeSource === "dna" ? "Brand DNA" : "Brand Playbook"}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-4 text-[11px]">
            <ScoreCell label="Quality captions" detail={`${score.breakdown.qualityCaptions.count} items`} score={score.breakdown.qualityCaptions.score} weight={score.breakdown.qualityCaptions.weight} />
            <ScoreCell label="Positive reviews" detail={`${score.breakdown.positiveReviews.count} items`} score={score.breakdown.positiveReviews.score} weight={score.breakdown.positiveReviews.weight} />
            <ScoreCell label="GBP profile" detail={score.breakdown.gbpProfile.fieldsPresent.join(", ") || "incomplete"} score={score.breakdown.gbpProfile.score} weight={score.breakdown.gbpProfile.weight} />
            <ScoreCell label="Voice consistency" detail={score.breakdown.voiceConsistency.captionsAnalyzed > 0 ? `cv ${score.breakdown.voiceConsistency.cv ?? "—"}, n=${score.breakdown.voiceConsistency.captionsAnalyzed}` : "no captions"} score={score.breakdown.voiceConsistency.score} weight={score.breakdown.voiceConsistency.weight} />
          </div>
        </div>
      )}

      {/* Two-column body: Brand Playbook | Brand DNA */}
      <div className="grid grid-cols-2 gap-4">
        {/* LEFT: Brand Playbook */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold">Brand Playbook</h3>
              <p className="text-[10px] text-muted mt-0.5">Sonnet-derived from category. Sharpens via subscriber angle.</p>
            </div>
            <div className="flex items-center gap-2">
              {activeSource === "playbook" ? (
                <span className="rounded bg-accent/10 text-accent px-2 py-0.5 text-[10px] font-medium">Active</span>
              ) : (
                <button
                  onClick={() => activate("playbook")}
                  disabled={activating}
                  className="rounded border border-border px-2 py-1 text-[10px] font-medium hover:bg-surface-hover disabled:opacity-50"
                >
                  Activate
                </button>
              )}
              <GeneratePlaybookButton
                siteId={data.siteId}
                businessType={data.businessType || ""}
                location={data.location || ""}
                websiteUrl={data.url || ""}
                compact
              />
            </div>
          </div>
          {data.hasPlaybook ? (
            <BrandPlaybookView siteId={data.siteId} playbook={data.playbook} subscriberAngle={data.subscriberAngle} hideSharpen />
          ) : (
            <div className="rounded-xl border border-border bg-surface p-6 shadow-card text-center text-xs text-muted">
              No playbook yet. Click Generate above.
            </div>
          )}
        </div>

        {/* RIGHT: Brand DNA */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-card flex items-center justify-between">
            <div>
              <h3 className="text-xs font-semibold">Brand DNA</h3>
              <p className="text-[10px] text-muted mt-0.5">
                {dna ? `Augmented · generated ${timeAgo(dna.generated_at)}` : "Not generated yet"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {dna && (activeSource === "dna" ? (
                <span className="rounded bg-accent/10 text-accent px-2 py-0.5 text-[10px] font-medium">Active</span>
              ) : (
                <button
                  onClick={() => activate("dna")}
                  disabled={activating}
                  className="rounded border border-border px-2 py-1 text-[10px] font-medium hover:bg-surface-hover disabled:opacity-50"
                >
                  Activate
                </button>
              ))}
              <button
                onClick={() => generateOrRegenerate(!!dna)}
                disabled={generating}
                className="rounded bg-accent text-white px-2 py-1 text-[10px] font-medium hover:opacity-90 disabled:opacity-50"
                title={dna ? "Regenerate (~$0.15, 30-90s)" : "Generate Brand DNA (~$0.15, 30-90s)"}
              >
                {generating ? "Working…" : dna ? "Regenerate" : "Generate"}
              </button>
            </div>
          </div>

          {/* Sharpen panel — only when DNA exists */}
          {dna && (
            <div className="rounded-xl border border-success/40 bg-success/5 p-4">
              <p className="text-xs font-semibold mb-1">{dna.subscriber_angle ? "DNA Angle" : "Sharpen Brand DNA"}</p>
              <p className="text-[10px] text-muted mb-2">
                What makes this business different from every other {data.businessType}? Anchors all DNA generation.
              </p>
              <textarea
                value={sharpenAngle}
                onChange={(e) => setSharpenAngle(e.target.value)}
                placeholder="e.g., We focus on serious home cooks and prosumer chefs — the kitchen should reflect the cooking experience."
                rows={2}
                className="w-full text-xs rounded border border-success/30 bg-background px-3 py-2 focus:border-accent focus:outline-none resize-y"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={sharpen}
                  disabled={sharpening || !sharpenAngle.trim()}
                  className="rounded bg-success text-white px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {sharpening ? "Sharpening…" : dna.subscriber_angle ? "Re-sharpen DNA" : "Sharpen DNA"}
                </button>
              </div>
            </div>
          )}

          {dna ? (
            <BrandPlaybookView siteId={data.siteId} playbook={dna.playbook} subscriberAngle={dna.subscriber_angle || null} hideSharpen />
          ) : (
            <div className="rounded-xl border border-border bg-surface p-6 shadow-card text-center">
              <p className="text-xs text-muted mb-3">Brand DNA hasn&apos;t been generated yet.</p>
              <p className="text-[10px] text-muted mb-4">
                Augments the Brand Playbook with extracted signals from this site&apos;s historical posts, reviews, and GBP profile.
                Tier: <strong>{score?.tier || "—"}</strong>
              </p>
              <button
                onClick={() => generateOrRegenerate(false)}
                disabled={generating}
                className="rounded bg-accent text-white px-4 py-2 text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                {generating ? "Generating…" : "Generate Brand DNA"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreCell({ label, detail, score, weight }: { label: string; detail: string; score: number; weight: number }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted mb-1">{label}</p>
      <p className="font-medium">{detail}</p>
      <p className="text-[10px] text-muted mt-0.5">score {score} · weight {weight}</p>
    </div>
  );
}

export default function ManageBrandPage() {
  return (
    <ManagePage title="Brand" requireSite>
      {({ siteId }) => <BrandContent siteId={siteId} />}
    </ManagePage>
  );
}
