"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  StatisticalBundle,
  OfferRec,
  AudienceRec,
  PositioningRec,
  PositioningAngle,
  HookRec,
  TaglineRec,
  CtaRec,
  DisqualificationSignal,
  Confidence,
  OwnerAction,
  StalenessAssessment,
} from "@/lib/brand-identity/statistical-recommendation";

interface PersistedRecord {
  id: string;
  businessId: string;
  brandIdentityId: string;
  cmaId: string;
  promptVersion: string;
  model: string;
  bundle: StatisticalBundle;
  inputTokens: number;
  outputTokens: number;
  ownerAction: OwnerAction;
  ownerActionAt: string | null;
  createdAt: string;
}

interface Site {
  id: string;
  name: string;
}

export function StrategicRecommendationClient({ subscriberId }: { subscriberId: string }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [rec, setRec] = useState<PersistedRecord | null>(null);
  const [staleness, setStaleness] = useState<StalenessAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorReason, setErrorReason] = useState<string | null>(null);
  const [revealDisqualified, setRevealDisqualified] = useState(false);

  // Load sites for this subscriber
  useEffect(() => {
    fetch(`/api/admin/sites?subscription_id=${subscriberId}`)
      .then((r) => (r.ok ? r.json() : { sites: [] }))
      .then((d: { sites: Site[] }) => {
        setSites(d.sites || []);
        if (d.sites?.length > 0) setSelectedSiteId(d.sites[0].id);
      });
  }, [subscriberId]);

  const loadLatest = useCallback(async () => {
    if (!selectedSiteId) return;
    setLoading(true);
    setError(null);
    setErrorReason(null);
    setRevealDisqualified(false);
    try {
      const res = await fetch(`/api/admin/strategic-recommendation/${selectedSiteId}`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const d = await res.json();
      setRec(d.recommendation);
      setStaleness(d.staleness ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedSiteId]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  async function generate() {
    if (!selectedSiteId) return;
    setGenerating(true);
    setError(null);
    setErrorReason(null);
    try {
      const res = await fetch(`/api/admin/strategic-recommendation/${selectedSiteId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || `Generate failed (${res.status})`);
        setErrorReason(d.reason || null);
        return;
      }
      // Reload to get the freshly persisted record (with id, ownerAction, etc.)
      await loadLatest();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

  if (!subscriberId) {
    return <div className="p-4 text-xs text-muted">Select a subscriber to view strategic recommendations.</div>;
  }

  return (
    <div className="space-y-4 p-4">
      {/* Site picker + generate */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <label className="text-[10px] text-muted">Business</label>
            <select
              value={selectedSiteId}
              onChange={(e) => setSelectedSiteId(e.target.value)}
              className="mt-1 w-full max-w-md rounded border border-border bg-background px-3 py-1.5 text-xs focus:border-accent focus:outline-none"
            >
              {sites.length === 0 && <option>No businesses</option>}
              {sites.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            {rec && (
              <span className="text-[10px] text-muted">
                Generated {new Date(rec.createdAt).toLocaleString()} ·{" "}
                <span className="font-medium">{rec.ownerAction}</span>
              </span>
            )}
            <button
              onClick={generate}
              disabled={generating || !selectedSiteId}
              className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {generating ? "Generating… (~30s)" : rec ? "Generate new" : "Generate"}
            </button>
          </div>
        </div>
        {error && (
          <div className="mt-2 rounded border border-danger/30 bg-danger/5 p-2 text-[11px] text-danger">
            <p className="font-semibold">{error}</p>
            {errorReason === "no_cma" && (
              <p className="mt-1 text-muted">
                → Run a Competitive Market Analysis first from{" "}
                <a href="/ops/competitive-analysis" className="underline">/ops/competitive-analysis</a>.
              </p>
            )}
            {errorReason === "no_brand_identity" && (
              <p className="mt-1 text-muted">
                → Create a brand identity record first from{" "}
                <a href="/ops/brand-identity" className="underline">/ops/brand-identity</a>.
              </p>
            )}
          </div>
        )}
      </div>

      {loading && !rec && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted shadow-card">
          Loading…
        </div>
      )}

      {rec === null && !loading && !generating && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center shadow-card">
          <p className="text-xs text-muted">No strategic recommendation generated yet.</p>
          <p className="mt-1 text-[10px] text-muted">
            Click "Generate" to synthesize a recommendation bundle from this business's CMA + brand identity.
          </p>
        </div>
      )}

      {generating && !rec && (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-xs text-muted shadow-card">
          <div className="animate-pulse">Synthesizing recommendation…</div>
          <p className="mt-2 text-[10px] text-muted">
            Opus 4.7 is reading the CMA + GBP + brand identity. Typical: 20-40s.
          </p>
        </div>
      )}

      {rec && (
        <BundleReview
          rec={rec}
          staleness={staleness}
          revealDisqualified={revealDisqualified}
          onRevealDisqualified={() => setRevealDisqualified(true)}
        />
      )}
    </div>
  );
}

// ============================================================================
// Bundle review — disqualification banner + per-element cards
// ============================================================================

function BundleReview({
  rec,
  staleness,
  revealDisqualified,
  onRevealDisqualified,
}: {
  rec: PersistedRecord;
  staleness: StalenessAssessment | null;
  revealDisqualified: boolean;
  onRevealDisqualified: () => void;
}) {
  const b = rec.bundle;
  const dq = b.disqualification_signal;
  const isStrongDQ = dq?.severity === "strong";
  const showBundle = !isStrongDQ || revealDisqualified;

  return (
    <div className="space-y-4">
      {/* Meta header */}
      <div className="rounded-xl border border-border bg-surface p-3 text-[10px] text-muted shadow-card">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span>Model: <span className="font-medium">{rec.model}</span></span>
          <span>Prompt: <span className="font-medium">{rec.promptVersion}</span></span>
          <span>Tokens: <span className="font-medium">{rec.inputTokens}/{rec.outputTokens}</span></span>
          <span>CMA: <span className="font-medium">{new Date(b.meta.cma_generated_at).toLocaleDateString()}</span></span>
          {b.meta.subscriber_tier && (
            <span>Tier: <span className="font-medium">{b.meta.subscriber_tier}</span></span>
          )}
        </div>
        {b.meta.data_insufficient_for.length > 0 && (
          <div className="mt-1 text-warning">
            Data insufficient for: {b.meta.data_insufficient_for.join(", ")}
          </div>
        )}
      </div>

      {/* Staleness banner — structural drift since rec was generated */}
      {staleness?.stale && <StalenessBanner staleness={staleness} />}

      {/* Disqualification banner */}
      {dq && (
        <DisqualificationBanner
          signal={dq}
          revealed={revealDisqualified}
          onReveal={onRevealDisqualified}
        />
      )}

      {showBundle && (
        <>
          {/* Positioning — the spine */}
          {b.positioning && <PositioningCard positioning={b.positioning} />}
          {!b.positioning && <DeferredCard label="Positioning" cause="Recommendation engine returned no positioning." />}

          {/* Audience */}
          {b.audience && <AudienceCard audience={b.audience} />}
          {!b.audience && <DeferredCard label="Audience" cause="Recommendation engine returned no audience." />}

          {/* Offer */}
          {b.offer && <OfferCard offer={b.offer} />}
          {!b.offer && <DeferredCard label="Offer" cause="Recommendation engine returned no offer." />}

          {/* Hooks */}
          <HooksCard hooks={b.hooks} dataThin={b.meta.hooks_data_thin} />

          {/* Tagline */}
          <TaglineCard tagline={b.tagline} />

          {/* CTA */}
          {b.cta && <CtaCard cta={b.cta} />}
          {!b.cta && <DeferredCard label="CTA" cause="Recommendation engine returned no CTA." />}

          {/* Action footer */}
          <ActionFooter ownerAction={rec.ownerAction} />
        </>
      )}
    </div>
  );
}

// ============================================================================
// Cards
// ============================================================================

function StalenessBanner({ staleness }: { staleness: StalenessAssessment }) {
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 shadow-card">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-xs font-semibold text-warning">
            Structural change since this recommendation
          </p>
          <p className="mt-1 text-[10px] text-muted">
            Rec generated against CMA from {new Date(staleness.recCmaGeneratedAt).toLocaleDateString()}.
            Latest CMA ({new Date(staleness.latestCmaGeneratedAt).toLocaleDateString()}) shows the following
            structural changes that reshape the strategic positioning:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
            {staleness.changes.map((c, i) => (
              <li key={i}>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  {c.field.replace("_", " ")}:
                </span>{" "}
                {c.description}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-muted">
            Click <span className="font-medium">Generate new</span> above to regenerate against the latest evidence.
          </p>
        </div>
      </div>
    </div>
  );
}

function DisqualificationBanner({
  signal,
  revealed,
  onReveal,
}: {
  signal: DisqualificationSignal;
  revealed: boolean;
  onReveal: () => void;
}) {
  const isStrong = signal.severity === "strong";
  const containerCls = isStrong
    ? "border-danger/40 bg-danger/5"
    : "border-warning/40 bg-warning/5";
  const labelCls = isStrong ? "text-danger" : "text-warning";

  return (
    <div className={`rounded-xl border p-4 shadow-card ${containerCls}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-xs font-semibold ${labelCls}`}>
            {isStrong ? "Disqualification — strong signal" : "Disqualification — advisory"}
          </p>
          <p className="mt-1 text-xs">{signal.reasoning}</p>
        </div>
      </div>
      <div className="mt-3 border-t border-border/50 pt-2">
        <p className="text-[10px] font-semibold text-muted">Recommended path</p>
        <p className="mt-0.5 text-xs">{signal.off_ramp_recommendation}</p>
      </div>
      {isStrong && !revealed && (
        <div className="mt-3 border-t border-border/50 pt-2">
          <button
            onClick={onReveal}
            className="text-[10px] text-muted underline hover:text-foreground"
          >
            Show recommendation anyway (proceed with caution)
          </button>
        </div>
      )}
    </div>
  );
}

function PositioningCard({ positioning }: { positioning: PositioningRec }) {
  const [lead, ...alternatives] = positioning.angles;

  return (
    <Section title="Positioning" subtitle="The strategic spine — where this brand stands">
      {!lead && (
        <p className="text-xs text-muted">No positioning angle produced.</p>
      )}
      {lead && <AngleCard angle={lead} isLead />}
      {alternatives.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Alternative angles · ranked by evidence weight
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {alternatives.map((a, i) => (
              <AngleCard key={i} angle={a} isLead={false} />
            ))}
          </div>
        </div>
      )}
      <ReasoningBlock reasoning={positioning.reasoning} coherence={positioning.coherence} />
    </Section>
  );
}

function AngleCard({ angle, isLead }: { angle: PositioningAngle; isLead: boolean }) {
  const containerCls = isLead
    ? "border-accent/40 bg-accent/5 p-4"
    : "border-border bg-background p-3";
  return (
    <div className={`rounded border ${containerCls}`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className={isLead ? "text-sm font-semibold" : "text-xs font-semibold"}>
          {isLead && <span className="mr-1 text-[10px] uppercase tracking-wide text-accent">Lead ·</span>}
          {angle.label}
        </h4>
        <ConfidencePill confidence={angle.confidence} />
      </div>
      <div className="mt-2 space-y-1.5 text-xs">
        <div>
          <span className="text-[10px] font-semibold text-muted">Wedge:</span>{" "}
          <span>{angle.wedge}</span>
        </div>
        <div>
          <span className="text-[10px] font-semibold text-muted">Contrast:</span>{" "}
          <span>{angle.contrast}</span>
        </div>
        <div>
          <span className="text-[10px] font-semibold text-muted">Example:</span>{" "}
          <span className="italic">{angle.example}</span>
        </div>
        {angle.applies_to.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {angle.applies_to.map((a, i) => (
              <span key={i} className="rounded bg-surface px-1.5 py-0.5 text-[9px] text-muted">
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
      {!isLead && (
        <div className="mt-3 flex gap-2 border-t border-border/40 pt-2">
          <button
            disabled
            title="Atomic write to declared not yet wired"
            className="rounded border border-border bg-surface px-2 py-1 text-[10px] text-muted disabled:opacity-50"
          >
            Approve this instead
          </button>
          <button
            disabled
            title="Atomic write to declared not yet wired"
            className="rounded border border-border bg-surface px-2 py-1 text-[10px] text-muted disabled:opacity-50"
          >
            Approve in addition
          </button>
        </div>
      )}
    </div>
  );
}

function AudienceCard({ audience }: { audience: AudienceRec }) {
  return (
    <Section title="Audience" subtitle="Who this strategy speaks to">
      <div className="space-y-2">
        <div>
          <span className="text-[10px] font-semibold text-muted">Primary:</span>{" "}
          <span className="text-xs">{audience.primary}</span>
          <ConfidencePill confidence={audience.confidence} className="ml-2" />
        </div>
        {audience.pains.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted">Pains</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs">
              {audience.pains.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}
        {audience.triggers.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted">Triggers</p>
            <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs">
              {audience.triggers.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>
        )}
      </div>
      <ReasoningBlock reasoning={audience.reasoning} coherence={audience.coherence} />
    </Section>
  );
}

function OfferCard({ offer }: { offer: OfferRec }) {
  return (
    <Section title="Offer" subtitle="What's transacted">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs">{offer.recommendation}</p>
        <ConfidencePill confidence={offer.confidence} />
      </div>
      <ReasoningBlock reasoning={offer.reasoning} coherence={offer.coherence} />
    </Section>
  );
}

function HooksCard({ hooks, dataThin }: { hooks: HookRec[]; dataThin: boolean }) {
  return (
    <Section title="Hooks" subtitle={`${hooks.length} opening lines — pick favorites at use time`}>
      {dataThin && (
        <div className="mb-3 rounded border border-warning/30 bg-warning/5 p-2 text-[10px] text-warning">
          Limited hook variety due to thin evidence — consider revisiting after CMA refresh.
        </div>
      )}
      {hooks.length === 0 ? (
        <p className="text-xs text-muted">No hooks produced.</p>
      ) : (
        <ul className="space-y-2">
          {hooks.map((h, i) => (
            <li key={i} className="rounded border border-border bg-background p-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs">{h.hook}</p>
                <span className="shrink-0 rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-medium text-accent">
                  {h.format}
                </span>
              </div>
              <p className="mt-1 text-[10px] text-muted">
                <span className="font-semibold">Ladders to:</span> {h.ladders_to}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function TaglineCard({ tagline }: { tagline: TaglineRec | null }) {
  if (!tagline) {
    return <DeferredCard label="Tagline" cause="Recommendation engine returned no tagline." />;
  }
  if (tagline.recommendation === null) {
    return (
      <Section title="Tagline" subtitle="Compression of the positioning">
        <div className="rounded border border-border bg-background p-3 opacity-70">
          <p className="text-xs font-medium">Tagline deferred</p>
          <p className="mt-1 text-[10px] text-muted">
            {tagline.cause || "Positioning is still settling — author manually or revisit after positioning approval."}
          </p>
        </div>
      </Section>
    );
  }
  return (
    <Section title="Tagline" subtitle="Compression of the positioning">
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-medium italic">"{tagline.recommendation}"</p>
        {tagline.confidence && <ConfidencePill confidence={tagline.confidence} />}
      </div>
      <ReasoningBlock reasoning={tagline.reasoning} coherence={tagline.coherence} />
    </Section>
  );
}

function CtaCard({ cta }: { cta: CtaRec }) {
  return (
    <Section title="Call to Action" subtitle="Conversion mechanism">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs">
            <span className="text-[10px] font-semibold text-muted">Primary:</span> {cta.primary}
          </p>
          {cta.secondary && (
            <p className="mt-1 text-xs">
              <span className="text-[10px] font-semibold text-muted">Secondary:</span> {cta.secondary}
            </p>
          )}
        </div>
        <ConfidencePill confidence={cta.confidence} />
      </div>
      <ReasoningBlock reasoning={cta.reasoning} coherence={cta.coherence} />
    </Section>
  );
}

function DeferredCard({ label, cause }: { label: string; cause: string }) {
  return (
    <Section title={label}>
      <div className="rounded border border-border bg-background p-3 opacity-70">
        <p className="text-xs font-medium">{label} deferred</p>
        <p className="mt-1 text-[10px] text-muted">{cause}</p>
      </div>
    </Section>
  );
}

function ActionFooter({ ownerAction }: { ownerAction: OwnerAction }) {
  const isPending = ownerAction === "pending";
  return (
    <div className="sticky bottom-0 rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] text-muted">
          State: <span className="font-medium">{ownerAction}</span>
          {!isPending && <span className="ml-2 text-muted">(set previously)</span>}
        </div>
        <div className="flex gap-2">
          <button
            disabled
            title="Reject — wires to setStrategicRecommendationAction in next step"
            className="rounded border border-border bg-background px-3 py-1.5 text-xs text-muted disabled:opacity-50"
          >
            Reject
          </button>
          <button
            disabled
            title="Approve — atomic write to brand_identity declared not yet wired"
            className="rounded bg-success px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            Approve all
          </button>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted">
        Approve/Reject actions stub-only — atomic write to brand_identity declared comes in the next TODO.
      </p>
    </div>
  );
}

// ============================================================================
// Shared bits
// ============================================================================

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-3">
        <h3 className="text-sm font-medium">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[10px] text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function ConfidencePill({ confidence, className }: { confidence: Confidence; className?: string }) {
  const colorCls =
    confidence === "high"
      ? "bg-success/10 text-success"
      : confidence === "medium"
        ? "bg-warning/10 text-warning"
        : "bg-muted/10 text-muted";
  return (
    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${colorCls} ${className ?? ""}`}>
      {confidence}
    </span>
  );
}

function ReasoningBlock({ reasoning, coherence }: { reasoning: string; coherence: string }) {
  return (
    <div className="mt-3 space-y-1 border-t border-border/40 pt-2">
      <p className="text-[10px] text-muted">
        <span className="font-semibold">Reasoning:</span> {reasoning}
      </p>
      {coherence && (
        <p className="text-[10px] text-muted">
          <span className="font-semibold">Coherence:</span> {coherence}
        </p>
      )}
    </div>
  );
}
