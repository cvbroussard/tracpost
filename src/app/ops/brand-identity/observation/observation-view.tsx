"use client";
import { useCallback, useEffect, useState } from "react";
import { BucketTabs } from "../page";
import type {
  BrandIdentityObservationPayload,
  BrandClassVerdict,
  DescriptorObservation,
} from "@/lib/brand-identity/aesthetic-observation-types";

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
    { key: "verbal.voice_source",     label: "Voice source",     observation: p.verbal.voice_source },
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

