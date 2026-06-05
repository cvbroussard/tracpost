"use client";
import { useCallback, useEffect, useState } from "react";
import { BucketTabs } from "../page";
import type {
  BrandIdentityObservationPayload,
  BrandClassVerdict,
  DescriptorObservation,
} from "@/lib/brand-identity/aesthetic-observation-types";
import type {
  ReadinessFinding,
  ReadinessFindingsPayload,
  FindingAttribution,
  FindingSeverity,
} from "@/lib/brand-identity/readiness-findings-types";

interface ApprovalStatus {
  source: "owner_typed" | "observation_approved" | null;
  approvedAt?: string | null;
  observationSubstrateId?: string | null;
  hasDeclared: boolean;
}

interface ObservationApiResponse {
  observation: {
    id: string;
    payload: BrandIdentityObservationPayload;
    generationMetadata: {
      model: string;
      prompt_version: string;
      generated_at: string;
      confidence?: number | null;
      inputs?: Record<string, unknown>;
    } | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  approvals: Record<string, ApprovalStatus>;
}

const VERDICT_LABEL: Record<BrandClassVerdict, string> = {
  type_a: "Type A · well-established, distinctive, consistent",
  type_b: "Type B · existing but inconsistent or generic",
  type_c: "Type C · existing but mismatched with offering",
  type_d: "Type D · insufficient observable presence",
};

const VERDICT_COLORS: Record<BrandClassVerdict, string> = {
  type_a: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300",
  type_b: "bg-amber-500/15 text-amber-700 border-amber-500/30 dark:text-amber-300",
  type_c: "bg-orange-500/15 text-orange-700 border-orange-500/30 dark:text-orange-300",
  type_d: "bg-slate-500/15 text-slate-700 border-slate-500/30 dark:text-slate-300",
};

type ViewState =
  | { kind: "loading" }
  | { kind: "loaded"; data: ObservationApiResponse }
  | { kind: "error"; message: string };

export function ObservationView({ siteId }: { siteId: string }) {
  // Single discriminated state — keyed on siteId so it resets via remount on
  // siteId change without violating react-hooks/set-state-in-effect.
  return <ObservationFetcher key={siteId} siteId={siteId} />;
}

function ObservationFetcher({ siteId }: { siteId: string }) {
  const [state, setState] = useState<ViewState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ops/brand-identity/observation?siteId=${siteId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`API ${r.status}`);
        return r.json() as Promise<ObservationApiResponse>;
      })
      .then((data) => {
        if (!cancelled) setState({ kind: "loaded", data });
      })
      .catch((e) => {
        if (!cancelled) {
          setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  /** Optimistic-update approval state for a descriptor after a successful commit. */
  const recordApproval = useCallback(
    (descriptorKey: string, substrateId: string) => {
      setState((s) => {
        if (s.kind !== "loaded") return s;
        return {
          ...s,
          data: {
            ...s.data,
            approvals: {
              ...s.data.approvals,
              [descriptorKey]: {
                source: "observation_approved",
                approvedAt: new Date().toISOString(),
                observationSubstrateId: substrateId,
                hasDeclared: true,
              },
            },
          },
        };
      });
    },
    [],
  );

  return (
    <Shell>
      <ObservationBody state={state} siteId={siteId} onApproved={recordApproval} />
    </Shell>
  );
}

/** Page shell — renders the bucket-tabs nav strip on every state. */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-4 space-y-4 pb-12">
      <BucketTabs bucket="observation" />
      {children}
    </div>
  );
}

interface ApproveHandler {
  (descriptorKey: string, substrateId: string): void;
}

function ObservationBody({
  state,
  siteId,
  onApproved,
}: {
  state: ViewState;
  siteId: string;
  onApproved: ApproveHandler;
}) {
  if (state.kind === "error") {
    return (
      <div className="p-2">
        <h2 className="text-sm font-medium mb-2">Brand Identity — Public Presence</h2>
        <p className="text-xs text-red-600">Failed to load analysis: {state.message}</p>
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="p-2">
        <h2 className="text-sm font-medium mb-2">Brand Identity — Public Presence</h2>
        <p className="text-xs text-muted">Loading…</p>
      </div>
    );
  }

  if (!state.data.observation) {
    return (
      <div className="p-2">
        <h2 className="text-sm font-medium mb-2">Brand Identity — Public Presence</h2>
        <p className="text-xs text-muted">
          No public presence analysis has been generated yet for this site. Run
          the aesthetic extractor from the Brand Identity page to produce one.
        </p>
      </div>
    );
  }

  const { id: substrateId, payload, generationMetadata, updatedAt } = state.data.observation;
  const approvals = state.data.approvals;
  const ctx: DescriptorCardContext = { siteId, substrateId, approvals, onApproved };

  return (
    <div className="space-y-8 max-w-5xl">
      <Header payload={payload} updatedAt={updatedAt} />
      <Scores payload={payload} />
      {payload.distinctive_elements_vs_category_defaults?.length > 0 && (
        <Section title="Distinctive elements vs category defaults">
          <BulletList items={payload.distinctive_elements_vs_category_defaults} />
        </Section>
      )}
      {payload.gaps_and_absences?.length > 0 && (
        <Section title="Gaps & absences">
          <BulletList items={payload.gaps_and_absences} />
        </Section>
      )}
      <DomainSection title="Verbal" slots={verbalSlots(payload)} ctx={ctx} />
      <DomainSection title="Strategic" slots={strategicSlots(payload)} ctx={ctx} />
      <DomainSection title="Visual" slots={visualSlots(payload)} ctx={ctx} />
      <DomainSection title="Sonic" slots={sonicSlots(payload)} ctx={ctx} />
      <FindingsSection siteId={siteId} observationSubstrateId={substrateId} />
      <GenerationFooter generationMetadata={generationMetadata} />
    </div>
  );
}

interface DescriptorCardContext {
  siteId: string;
  substrateId: string;
  approvals: Record<string, ApprovalStatus>;
  onApproved: ApproveHandler;
}

function Header({
  payload,
  updatedAt,
}: {
  payload: BrandIdentityObservationPayload;
  updatedAt: string;
}) {
  const verdict = payload.meta.verdict;
  const confidencePct = Math.round((payload.meta.confidence ?? 0) * 100);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h1 className="text-xl font-semibold">Brand Identity — Public Presence Analysis</h1>
        <span className="text-xs text-muted">updated {new Date(updatedAt).toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${VERDICT_COLORS[verdict]}`}
        >
          {VERDICT_LABEL[verdict]}
        </span>
        <span className="text-xs text-muted">
          confidence <span className="font-medium text-foreground">{confidencePct}%</span>
        </span>
      </div>
      <p className="text-xs text-muted">
        What we found in the wild — observed from the brand&apos;s publicly accessible surfaces
        (website + GBP + signage) with agency-style discipline: factual observation only,
        no creative interpretation, no recommendations. Sibling pipeline to the CMA; the two
        bundle as the agency&apos;s opening-move assessment of this brand.
      </p>
    </div>
  );
}

function Scores({ payload }: { payload: BrandIdentityObservationPayload }) {
  const m = payload.meta;
  return (
    <Section title="Scores">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ScoreCard label="Visual consistency" value={m.visual_consistency_score} />
        <ScoreCard label="Distinctiveness" value={m.distinctiveness_score} />
        <ScoreCard label="Alignment with positioning" value={m.alignment_with_positioning_score} />
      </div>
    </Section>
  );
}

function ScoreCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-xs leading-relaxed text-foreground">{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium border-b border-border pb-1">{title}</h2>
      {children}
    </section>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1.5 text-xs leading-relaxed text-foreground">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-muted shrink-0">·</span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

// ── Domain rendering ────────────────────────────────────────────────────────

interface DescriptorSlot {
  key: string;
  label: string;
  observation: DescriptorObservation<unknown> | null;
  /** Override for the default "Not observable from these sources" text when
   * the slot is structurally null for a specific reason (e.g. guardrails). */
  nullReason?: string;
}

/**
 * Per-domain note shown ABOVE the descriptor cards when the domain has a
 * structural reason its slots are absent/limited under public-presence
 * analysis. Without this, owners read N "not observable" cards and can't tell
 * whether the analysis failed vs the signal-source is out of scope.
 */
const DOMAIN_NOTES: Record<string, string> = {
  Sonic:
    "Sonic identity (voice, music, sound) is out of scope for public presence analysis — these signals populate from audio-identity analysis when CTV ads, podcasts, jingles, or voiceover samples are observed. None of those sources are part of this pipeline.",
};

function DomainSection({
  title,
  slots,
  ctx,
}: {
  title: string;
  slots: DescriptorSlot[];
  ctx: DescriptorCardContext;
}) {
  const note = DOMAIN_NOTES[title];
  const allNull = slots.every((s) => s.observation === null);
  return (
    <Section title={title}>
      {note && (
        <p className="text-[11px] italic text-muted leading-relaxed">{note}</p>
      )}
      {allNull && note ? null : (
        <div className="space-y-3">
          {slots.map((s) => (
            <DescriptorCard key={s.key} slot={s} ctx={ctx} />
          ))}
        </div>
      )}
    </Section>
  );
}

function DescriptorCard({
  slot,
  ctx,
}: {
  slot: DescriptorSlot;
  ctx: DescriptorCardContext;
}) {
  const isNull = slot.observation === null;
  // Extract the bare descriptor key for approval API (catalog uses bare keys,
  // not domain-prefixed). slot.key is "domain.key"; strip the prefix.
  const bareKey = slot.key.split(".").slice(1).join(".");
  const approval = ctx.approvals[bareKey];
  return (
    <div className="rounded border border-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <span className="text-xs font-medium">{slot.label}</span>
          <span className="ml-2 text-[10px] text-muted">{slot.key}</span>
        </div>
        <ApprovalControl
          isNull={isNull}
          slotKey={bareKey}
          approval={approval}
          ctx={ctx}
        />
      </div>
      {isNull ? (
        <p className="mt-2 text-[11px] italic text-muted leading-relaxed">
          {slot.nullReason ?? "Not observable from these sources."}
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          <Observed observed={slot.observation!.observed} />
          {slot.observation!.evidence?.length > 0 && (
            <Evidence items={slot.observation!.evidence} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Per-descriptor approval control: shows the approve button (when actionable),
 * the approved badge (when committed), or a non-actionable label for null /
 * owner-typed-but-not-from-observation cases.
 */
function ApprovalControl({
  isNull,
  slotKey,
  approval,
  ctx,
}: {
  isNull: boolean;
  slotKey: string;
  approval?: ApprovalStatus;
  ctx: DescriptorCardContext;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isNull) {
    return (
      <span className="text-[10px] uppercase tracking-wide text-muted shrink-0">
        not observable
      </span>
    );
  }

  if (approval?.source === "observation_approved") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300 shrink-0"
        title={approval.approvedAt ? `Approved ${new Date(approval.approvedAt).toLocaleString()}` : undefined}
      >
        ✓ Approved from observation
      </span>
    );
  }

  if (approval?.source === "owner_typed") {
    return (
      <span className="text-[10px] uppercase tracking-wide text-muted shrink-0" title="Owner-typed declared content exists; approving observation would overwrite it. Edit via the Creative bucket to manage owner-typed declarations.">
        owner-typed
      </span>
    );
  }

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/ops/brand-identity/observation/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteId: ctx.siteId,
          descriptorKey: slotKey,
          observationSubstrateId: ctx.substrateId,
        }),
      });
      const json = (await res.json()) as { committed: boolean; reason?: string };
      if (!res.ok || !json.committed) {
        setError(json.reason || `API ${res.status}`);
        setSubmitting(false);
        return;
      }
      // Optimistic: notify parent so the approval badge replaces the button.
      ctx.onApproved(slotKey, ctx.substrateId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-medium text-foreground hover:bg-accent/20 disabled:opacity-50"
      >
        {submitting ? "Approving…" : "Approve as canonical"}
      </button>
      {error && <span className="text-[10px] text-red-600 max-w-[12rem] text-right">{error}</span>}
    </div>
  );
}

function Observed({ observed }: { observed: unknown }) {
  // String → render as quoted prose.
  if (typeof observed === "string") {
    return <p className="text-xs leading-relaxed text-foreground">{observed}</p>;
  }
  // String[] → render as inline pills.
  if (Array.isArray(observed) && observed.every((v) => typeof v === "string")) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {(observed as string[]).map((v, i) => (
          <span key={i} className="rounded bg-muted/20 px-2 py-0.5 text-[11px]">
            {v}
          </span>
        ))}
      </div>
    );
  }
  // Object → render each key as a sub-block.
  if (observed && typeof observed === "object") {
    const entries = Object.entries(observed as Record<string, unknown>);
    return (
      <div className="space-y-2">
        {entries.map(([k, v]) => (
          <div key={k}>
            <div className="text-[10px] uppercase tracking-wide text-muted">{prettyKey(k)}</div>
            <div className="mt-0.5">
              <Observed observed={v} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  // Fallback — JSON.
  return (
    <pre className="text-[11px] overflow-x-auto rounded bg-muted/10 p-2">
      {JSON.stringify(observed, null, 2)}
    </pre>
  );
}

function Evidence({ items }: { items: string[] }) {
  return (
    <details className="text-[11px]">
      <summary className="cursor-pointer text-muted hover:text-foreground">
        Evidence ({items.length})
      </summary>
      <ul className="mt-1.5 space-y-1 pl-3">
        {items.map((it, i) => (
          <li key={i} className="text-muted">
            <span className="text-muted/60">·</span> {it}
          </li>
        ))}
      </ul>
    </details>
  );
}

function GenerationFooter({
  generationMetadata,
}: {
  generationMetadata: { model: string; prompt_version: string; generated_at: string } | null;
}) {
  if (!generationMetadata) return null;
  return (
    <div className="border-t border-border pt-4 text-[10px] text-muted space-y-1">
      <div>
        Model: <span className="font-mono">{generationMetadata.model}</span>
        {" · "}Prompt: <span className="font-mono">{generationMetadata.prompt_version}</span>
        {" · "}Generated: {new Date(generationMetadata.generated_at).toLocaleString()}
      </div>
    </div>
  );
}

// ── Slot extractors ─────────────────────────────────────────────────────────

function verbalSlots(p: BrandIdentityObservationPayload): DescriptorSlot[] {
  return [
    { key: "verbal.tone",             label: "Tone",             observation: p.verbal.tone },
    { key: "verbal.lexicon",          label: "Lexicon",          observation: p.verbal.lexicon },
    { key: "verbal.avoid",            label: "Avoid",            observation: p.verbal.avoid },
    { key: "verbal.pov_persona",      label: "Point of view",    observation: p.verbal.pov_persona },
    { key: "verbal.mechanical_style", label: "Mechanical style", observation: p.verbal.mechanical_style },
    { key: "verbal.tagline",          label: "Tagline",          observation: p.verbal.tagline },
  ];
}

function strategicSlots(p: BrandIdentityObservationPayload): DescriptorSlot[] {
  return [
    { key: "strategic.offer",       label: "Offer",       observation: p.strategic.offer },
    { key: "strategic.positioning", label: "Positioning", observation: p.strategic.positioning },
    { key: "strategic.audience",    label: "Audience",    observation: p.strategic.audience },
    { key: "strategic.proof",       label: "Proof",       observation: p.strategic.proof },
    { key: "strategic.hooks",       label: "Hooks",       observation: p.strategic.hooks },
    { key: "strategic.cta",         label: "Call to action", observation: p.strategic.cta },
  ];
}

function visualSlots(p: BrandIdentityObservationPayload): DescriptorSlot[] {
  return [
    { key: "visual.aesthetic",          label: "Aesthetic",            observation: p.visual.aesthetic },
    { key: "visual.environmental_look", label: "Environmental look",   observation: p.visual.environmental_look },
    { key: "visual.subject_style",      label: "Subject style",        observation: p.visual.subject_style },
    { key: "visual.palette",            label: "Palette",              observation: p.visual.palette },
    { key: "visual.logo",               label: "Logo",                 observation: p.visual.logo },
    {
      key: "visual.do_not_show",
      label: "Do not show",
      observation: p.visual.do_not_show,
      nullReason:
        "Guardrails are owner-declared only — by definition not observable from any public source. This descriptor populates from the brand identity declaration phase, not from observation.",
    },
  ];
}

function sonicSlots(p: BrandIdentityObservationPayload): DescriptorSlot[] {
  return [
    { key: "sonic.voiceover_character", label: "Voiceover character", observation: p.sonic.voiceover_character },
    { key: "sonic.music_mood",          label: "Music mood",          observation: p.sonic.music_mood },
    { key: "sonic.sfx_style",           label: "SFX style",           observation: p.sonic.sfx_style },
    { key: "sonic.pronunciation",       label: "Pronunciation",       observation: p.sonic.pronunciation },
  ];
}

function prettyKey(k: string): string {
  return k.replace(/_/g, " ");
}

// ── Readiness findings (Tier 3) ─────────────────────────────────────────────

interface FindingsApiResponse {
  findings: ReadinessFindingsPayload | null;
  updatedAt: string | null;
}

const SEVERITY_ORDER: FindingSeverity[] = ["blocking", "refinement", "informational"];

const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  blocking: "Blocking",
  refinement: "Refinement",
  informational: "Informational",
};

const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  blocking: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300",
  refinement: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  informational: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

const ATTRIBUTION_LABEL: Record<FindingAttribution, string> = {
  external: "External — owner-controlled surface",
  inconsistency: "Inconsistency — mismatched surfaces",
  brand_gap: "Brand gap — signal absent",
};

function FindingsSection({
  siteId,
  observationSubstrateId,
}: {
  siteId: string;
  observationSubstrateId: string;
}) {
  const [findings, setFindings] = useState<ReadinessFindingsPayload | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFindings = useCallback(async () => {
    try {
      const r = await fetch(`/api/ops/brand-identity/findings?siteId=${siteId}`);
      if (!r.ok) throw new Error(`API ${r.status}`);
      const json = (await r.json()) as FindingsApiResponse;
      setFindings(json.findings);
      setUpdatedAt(json.updatedAt);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void fetchFindings();
  }, [fetchFindings]);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(`/api/ops/brand-identity/findings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      const json = (await r.json()) as { persisted: boolean; reason?: string };
      if (!r.ok || !json.persisted) {
        setError(json.reason || `API ${r.status}`);
        setGenerating(false);
        return;
      }
      await fetchFindings();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  // Stale detector — if findings exist but their source_substrate_id doesn't
  // match the current observation, the substrate has been refreshed and the
  // findings are out of sync.
  const stale =
    findings !== null &&
    findings.meta.source_substrate_id !== observationSubstrateId;

  return (
    <Section title="Readiness findings">
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-muted leading-relaxed">
          Each observation above becomes a finding here, framed as an agency would in the first
          kickoff: &ldquo;explain this&rdquo; questions for owner-controlled surfaces, consultative
          proposals where signal is absent, transparent self-correcting notes where TracPost is
          responsible. The intake bundle (CMA + Public Presence) is the locked architecture; v1 is
          public-presence only.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="rounded border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent/20 disabled:opacity-50"
          >
            {generating
              ? "Generating findings… (may take up to 90s)"
              : findings
              ? "Regenerate findings"
              : "Generate findings"}
          </button>
          {updatedAt && (
            <span className="text-[10px] text-muted">
              Last generated {new Date(updatedAt).toLocaleString()}
            </span>
          )}
          {stale && (
            <span className="text-[10px] text-amber-700 dark:text-amber-300">
              ⚠ Observation has been refreshed — regenerate findings to sync
            </span>
          )}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {loading && !findings && (
        <p className="text-xs text-muted">Loading findings…</p>
      )}

      {!loading && !findings && (
        <p className="text-xs text-muted italic">
          No findings have been generated yet. Click <em>Generate findings</em> above to consolidate
          the observation into the agency-conversation deliverable.
        </p>
      )}

      {findings && <FindingsCountSummary counts={findings.meta.counts} />}

      {findings && (
        <div className="space-y-6">
          {SEVERITY_ORDER.map((sev) => (
            <SeverityGroup
              key={sev}
              severity={sev}
              findings={findings.findings.filter((f) => f.severity === sev)}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function FindingsCountSummary({
  counts,
}: {
  counts: ReadinessFindingsPayload["meta"]["counts"];
}) {
  return (
    <div className="flex flex-wrap gap-3 text-[11px]">
      <span className="text-muted">
        Total: <span className="font-medium text-foreground">{counts.total}</span>
      </span>
      {SEVERITY_ORDER.map((sev) =>
        counts.by_severity[sev] > 0 ? (
          <span key={sev} className={`rounded-full border px-2 py-0.5 ${SEVERITY_COLORS[sev]}`}>
            {SEVERITY_LABEL[sev]}: {counts.by_severity[sev]}
          </span>
        ) : null,
      )}
    </div>
  );
}

function SeverityGroup({
  severity,
  findings,
}: {
  severity: FindingSeverity;
  findings: ReadinessFinding[];
}) {
  if (findings.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium border-b border-border pb-1">
        {SEVERITY_LABEL[severity]} <span className="text-muted">({findings.length})</span>
      </h3>
      <div className="space-y-3">
        {findings.map((f) => (
          <FindingCard key={f.id} finding={f} />
        ))}
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: ReadinessFinding }) {
  return (
    <div className="rounded border border-border bg-card p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${SEVERITY_COLORS[finding.severity]}`}
        >
          {SEVERITY_LABEL[finding.severity]}
        </span>
        <span className="text-[10px] text-muted text-right">
          {ATTRIBUTION_LABEL[finding.attribution]}
          {finding.descriptor_key && (
            <>
              {" · "}
              <span className="font-mono">{finding.descriptor_key}</span>
            </>
          )}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-foreground">{finding.prompt_text}</p>
      <details className="text-[11px]">
        <summary className="cursor-pointer text-muted hover:text-foreground">
          Observed
        </summary>
        <p className="mt-1.5 text-foreground leading-relaxed">{finding.observation}</p>
        {finding.evidence.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 pl-3">
            {finding.evidence.map((e, i) => (
              <li key={i} className="text-muted">
                <span className="text-muted/60">·</span> {e}
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}
