"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ManagePage } from "@/components/manage/manage-page";
import { toast } from "@/components/feedback";
import { useDictation, type DictationState } from "@/hooks/use-dictation";
import { cdnImage } from "@/lib/cdn-image";
import {
  baselinesFor,
  forbiddenTermsFromAvoid,
  detectForbidden,
  type ForbiddenTerm,
} from "@/lib/brand-identity/baselines";
import {
  declaredDescriptors,
  PHASE_LABELS,
  PHASE_DESCRIPTIONS,
  type DescriptorPhase,
  type BrandDomain,
} from "@/lib/brand-identity/catalog";
import { isStatistical } from "@/lib/brand-identity/buckets";
import {
  WEASEL_WORD_CATEGORIES,
  totalWeaselWordsCount,
  forbiddenTermsFromWeaselWords,
} from "@/lib/brand-identity/weasel-words";
import type {
  OfferRec,
  AudienceRec,
  PositioningRec,
  HookRec,
  TaglineRec,
  CtaRec,
} from "@/lib/brand-identity/statistical-recommendation";
import Link from "next/link";

// ── Types (mirror the JSON from /api/ops/brand-identity) ────────────────────
type Domain = "verbal" | "strategic" | "visual" | "sonic";

interface DescriptorSlot {
  key: string;
  label: string;
  prompt: string;
  placeholder?: string;
  kind: "text" | "picker";
  options?: string[];
  required?: boolean;
}

interface AngleField {
  key: string;
  label: string;
  prompt: string;
  placeholder?: string;
  kind: "text" | "textarea" | "multi_picker" | "gbp_categories_picker";
  options?: string[];
  rows?: number;
  required?: boolean;
}

interface AngleSection {
  key: string;
  label: string;
  description?: string;
  fields: AngleField[];
}

interface DescriptorInput {
  key: string;
  label: string;
  prompt: string;
  // Kept in sync with src/lib/brand-identity/catalog.ts InputType union.
  // single_picker + multi_picker + example_set_picker + scaffolded_picker_matrix
  // + bool_toggle_overrides added 2026-06-06 per [[verbal-domain-decomposition]].
  // synthesis_review added 2026-06-07 per [[tagline-decomposition]] follow-up
  // — the locked-but-unbuilt primitive for tone.effect + voice_source.character.
  inputType:
    | "prose"
    | "list"
    | "slot_composition"
    | "angle_collection"
    | "single_picker"
    | "multi_picker"
    | "example_set_picker"
    | "scaffolded_picker_matrix"
    | "bool_toggle_overrides"
    | "synthesis_review";
  slotCount?: number;
  qualifier?: string;
  rows?: number;
  required?: boolean;
  slots?: DescriptorSlot[];
  angleSchema?: AngleSection[];
  defaultAngleCount?: number;
  /** For single_picker / multi_picker — universal option set. */
  options?: string[];
  /** For multi_picker — cap on selections. */
  maxSelections?: number;
  /** For single_picker / multi_picker — whether owner may add a custom value. */
  allowCustom?: boolean;
}

interface DescriptorSpec {
  key: string;
  domain: Domain;
  label: string;
  describes: string;
  media: ("text" | "asset" | "extracted")[];
  lean: "declared" | "extracted";
  override: "flexible" | "guardrail";
  phase: DescriptorPhase;
  inputs?: DescriptorInput[];
}

interface DescriptorAsset {
  assetId: string;
  role: string | null;
  position: number;
}

interface DescriptorRecord {
  id: string;
  domain: Domain;
  key: string;
  label: string | null;
  /**
   * Either a string (single-textarea descriptors) OR an object keyed by each
   * input's `key` (descriptors with `spec.inputs`).
   */
  declared: string | Record<string, unknown> | null;
  extracted: { summary?: string; value?: unknown } | null;
  extractedInputs: unknown | null;
  extractionModel: string | null;
  extractionConfidence: number | null;
  status: string | null;
  position: number;
  /** Per-descriptor configuration (baselinesApplied for guardrails, validationFindings for the quality gate). */
  metadata: {
    baselinesApplied?: string[];
    validationFindings?: {
      findings: Array<{
        inputKey: string;
        verdict: "pass" | "warn" | "attention";
        reason: string;
        // Exemplars (new shape, post-2026-05-30): per-source-labeled demonstrations.
        exemplars?: Array<{
          content: string;
          source: "existing" | "rephrased" | "new";
          fromSlot?: number;
        }>;
        // Legacy suggestion field (pre-exemplar shape) — kept for backward compat
        // on cached findings; normalized into exemplars[] at render time.
        suggestion?: string | string[];
      }>;
      checkedAt: string;
      model: string;
      error?: string;
    };
  } | null;
  assets: DescriptorAsset[];
  spec: DescriptorSpec | null;
}

interface BrandIdentityData {
  identity: { id: string; name: string | null };
  descriptors: DescriptorRecord[];
  /**
   * Read-only GBP categories joined from `business_gbp_categories`. Populated
   * by CMA + categories coaching (per [[gbp-categories-coaching]]). Surfaces
   * under the offer descriptor's "Services (from GBP)" section. Up to 10
   * (1 primary + 9 additional).
   */
  gbpCategories: { gcid: string; name: string; isPrimary: boolean }[];
}

interface PickerAsset {
  id: string;
  storage_url: string;
  media_type: string;
  context_note: string | null;
}

// ── Config ──────────────────────────────────────────────────────────────────
// Page grouping is by VALIDATION PHASE (the development/onboarding sequence),
// not by domain. Lower phases are dependency-free; higher phases depend on
// earlier phases being completed. See PHASE_LABELS in catalog.ts for the
// full ordering rationale. Domain remains as informational metadata on each
// descriptor card.
const PHASE_ORDER: DescriptorPhase[] = [1, 2, 3, 4, 5, 6, 7];
// Completion gate — all declared-lean descriptors required. Per the locked
// "start with all required, learn what to relax" methodology, we set the bar
// at maximum input first; relaxations come empirically once we measure each
// field's marginal contribution to extraction quality.
const REQUIRED_KEYS = new Set(declaredDescriptors().map((d) => d.key));

const isAssetCapable = (d: DescriptorRecord) => !!d.spec?.media.includes("asset");
const isTextCapable = (d: DescriptorRecord) => !!d.spec?.media.includes("text");
const isGuardrail = (d: DescriptorRecord) => d.spec?.override === "guardrail";
function isSatisfied(d: DescriptorRecord): boolean {
  if (d.key === "logo") return d.assets.length > 0;
  if (d.spec?.inputs) {
    const declared =
      d.declared && typeof d.declared === "object"
        ? (d.declared as Record<string, unknown>)
        : {};
    return d.spec.inputs
      .filter((i) => i.required)
      .every((i) => {
        const v = declared[i.key];
        if (i.inputType === "slot_composition") {
          if (!v || typeof v !== "object" || Array.isArray(v)) return false;
          const slotsObj = v as Record<string, unknown>;
          const requiredSlots = (i.slots ?? []).filter((s) => s.required);
          if (requiredSlots.length === 0) return true;
          return requiredSlots.every((s) => {
            const sv = slotsObj[s.key];
            return typeof sv === "string" && sv.trim().length > 0;
          });
        }
        if (i.inputType === "angle_collection") {
          // At least ONE angle must have all required fields filled across
          // all sections. Empty angle entries don't disqualify — owner may
          // have fewer angles than the default count.
          const angles = (v as { angles?: unknown[] } | null)?.angles;
          if (!Array.isArray(angles) || angles.length === 0) return false;
          const schema = i.angleSchema ?? [];
          return angles.some((angle) => {
            if (!angle || typeof angle !== "object" || Array.isArray(angle)) return false;
            const a = angle as Record<string, unknown>;
            return schema.every((section) => {
              const sec = a[section.key];
              if (!sec || typeof sec !== "object" || Array.isArray(sec)) {
                return !section.fields.some((f) => f.required);
              }
              const secObj = sec as Record<string, unknown>;
              return section.fields.filter((f) => f.required).every((f) => {
                const fv = secObj[f.key];
                if (Array.isArray(fv))
                  return fv.some((x) => typeof x === "string" && x.trim().length > 0);
                return typeof fv === "string" && fv.trim().length > 0;
              });
            });
          });
        }
        if (Array.isArray(v))
          return v.some((s) => typeof s === "string" && s.trim().length > 0);
        return typeof v === "string" && v.trim().length > 0;
      });
  }
  const text = typeof d.declared === "string" ? d.declared : "";
  return text.trim().length > 0;
}
/** Concatenate all string content in a draft (for cross-descriptor forbidden detection). */
function draftToText(draft: unknown): string {
  if (typeof draft === "string") return draft;
  if (draft && typeof draft === "object") {
    const obj = draft as Record<string, unknown>;
    return Object.values(obj)
      .flatMap((v) => {
        if (typeof v === "string") return [v];
        if (Array.isArray(v))
          return v.filter((s): s is string => typeof s === "string");
        return [];
      })
      .join(" ");
  }
  return "";
}
interface ExemplarRecord {
  content: string;
  source: "existing" | "rephrased" | "new";
  fromSlot?: number;
}

/**
 * Normalize a finding to the post-2026-05-30 exemplar shape. Backward-compat
 * shim for cached findings produced under earlier prompts (which returned
 * suggestion as a string or string[]).
 *
 * Legacy suggestion → exemplars: every legacy item becomes `source: "new"`
 * (we have no way to retroactively identify which items were from owner slots).
 */
function normalizeExemplars(
  finding: {
    exemplars?: Array<{
      content: string;
      source: "existing" | "rephrased" | "new";
      fromSlot?: number;
    }>;
    suggestion?: string | string[];
  },
  inputType: "list" | "prose",
): ExemplarRecord[] {
  if (Array.isArray(finding.exemplars)) return finding.exemplars;
  // Legacy: suggestion field
  if (typeof finding.suggestion === "string" && finding.suggestion.trim().length > 0) {
    if (inputType === "list") {
      return finding.suggestion
        .split(";")
        .map((s) => s.trim().replace(/^\d+\.\s*/, ""))
        .filter((s) => s.length > 0)
        .map((content) => ({ content, source: "new" as const }));
    }
    return [{ content: finding.suggestion, source: "new" }];
  }
  if (Array.isArray(finding.suggestion)) {
    return finding.suggestion
      .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
      .map((content) => ({ content, source: "new" as const }));
  }
  return [];
}

function findingFor(d: DescriptorRecord, inputKey: string) {
  return d.metadata?.validationFindings?.findings?.find(
    (f) => f.inputKey === inputKey,
  );
}

/**
 * Reduce a prose finding's exemplars to a single primary so the modal shows
 * exactly one option and "Accept all" is unambiguous (automation-ready: the
 * same one click that an owner makes manually is what autopilot will make
 * automatically once a descriptor's validator clears its stability gates).
 *
 * Selection rule (locked 2026-05-31): rephrased > new. Rephrased is preferred
 * because it preserves owner voice/structure with polish removed — closer to
 * the owner's intent than a fresh narrative angle. Only falls through to new
 * when no rephrased exists. Existing-source exemplars shouldn't appear here
 * (verdict would be pass).
 *
 * List inputs return all exemplars unchanged — they're complementary slot
 * members, not alternatives.
 */
function primaryExemplars(
  exemplars: ExemplarRecord[],
  inputType: "list" | "prose",
  currentText?: string,
): ExemplarRecord[] {
  if (inputType === "list") return exemplars;
  // Filter out verbatim copies of current — these are model no-ops (the
  // dominant failure mode for prose Stage 2: model returns current as
  // "rephrased" without actually transforming). Even when there's only
  // ONE exemplar returned, if it's verbatim of current it's useless.
  // Returning [] in that case lets the modal show the non-actionable path.
  const normalize = (s: string) => s.trim().replace(/\s+/g, " ");
  const currentNorm = currentText ? normalize(currentText) : null;
  const usable = currentNorm
    ? exemplars.filter((e) => normalize(e.content) !== currentNorm)
    : exemplars;
  if (usable.length === 0) return [];
  if (usable.length === 1) return usable;
  // Multiple usable exemplars: prefer rephrased > new > first.
  const rephrased = usable.find((e) => e.source === "rephrased");
  if (rephrased) return [rephrased];
  const fresh = usable.find((e) => e.source === "new");
  if (fresh) return [fresh];
  return [usable[0]];
}

/**
 * Mirror of the store-side scopeMemberKeys (kept client-safe). Returns the
 * sub-input keys belonging to a validation scope:
 *  - "lists"        → every list-type input
 *  - "prose:<key>"  → just [<key>]
 *  - non-decomposed → "prose:text" → ["text"]
 */
function scopeMemberKeysFromSpec(
  spec: DescriptorRecord["spec"],
  scope: string,
): string[] {
  if (!spec?.inputs) return scope === "prose:text" ? ["text"] : [];
  if (scope === "lists") {
    return spec.inputs.filter((i) => i.inputType === "list").map((i) => i.key);
  }
  if (scope.startsWith("prose:")) {
    const k = scope.slice("prose:".length);
    return spec.inputs.some((i) => i.key === k) ? [k] : [];
  }
  return [];
}

/**
 * Mirror of the store-side `computeAffectedScopes`. Identifies which validation
 * scopes are invalidated by a declared change. Used by saveValue's local state
 * mirror so the chip states track per-scope stale-on-edit accurately (without
 * a full reload after every save).
 */
function computeAffectedScopesClient(
  spec: DescriptorRecord["spec"],
  oldDeclared: unknown,
  newDeclared: unknown,
): Set<string> {
  const scopes = new Set<string>();
  if (!spec?.inputs) {
    const oldStr = typeof oldDeclared === "string" ? oldDeclared : "";
    const newStr = typeof newDeclared === "string" ? newDeclared : "";
    if (oldStr !== newStr) scopes.add("prose:text");
    return scopes;
  }
  const toObj = (v: unknown): Record<string, unknown> =>
    v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const oldObj = toObj(oldDeclared);
  const newObj = toObj(newDeclared);
  for (const input of spec.inputs) {
    const oldVal = oldObj[input.key];
    const newVal = newObj[input.key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      scopes.add(input.inputType === "list" ? "lists" : `prose:${input.key}`);
    }
  }
  return scopes;
}

/**
 * Mirror of the store-side `inputKeyScope`. Maps an input key to its validation
 * scope identifier.
 */
function inputKeyScopeClient(
  spec: DescriptorRecord["spec"],
  inputKey: string,
): string {
  if (!spec?.inputs) return `prose:${inputKey}`;
  const input = spec.inputs.find((i) => i.key === inputKey);
  if (!input) return `prose:${inputKey}`;
  return input.inputType === "list" ? "lists" : `prose:${inputKey}`;
}

/** Describes the validation state of a single group. */
type GroupState = "unvalidated" | "validating" | "passed" | "attention";

/**
 * Validation groups for a descriptor, derived from inputType per
 * [[descriptor-design-protocol]] default rules. Each group carries its own
 * state computed from `metadata.validationFindings.findings[]` filtered to
 * the group's member keys.
 */
interface ValidationGroup {
  id: string;                 // "lists" | "prose:<key>" | "slots:<key>"
  label: string;              // operator-facing badge label
  members: string[];          // sub-input keys in this group
  state: GroupState;
  attentionCount: number;     // members with non-pass findings
  /**
   * Whether this group runs through the validator. False for
   * slot_composition inputs (no validation yet — slots ARE substrate; the
   * composition LLM + slot-aware validator are deferred to next iteration).
   * When false, the renderer hides the chip + Validate/×5/Reset/Findings controls.
   */
  validatable: boolean;
}

/**
 * Render the three-element control row for ONE validation group:
 *   [state flag] [Validate button] [×5 button]
 *
 * State flag is informational (chip). Validate is the primary action; label
 * varies by state (Validate / Re-validate / Validating…). ×5 fires the
 * scope-aware stability diagnostic. Per [[descriptor-design-protocol]] each
 * validation group has its own three controls, so the owner can validate +
 * test stability per group without affecting other scopes.
 */
function renderGroupControl(
  g: ValidationGroup,
  anyValidating: boolean,
  onValidate: (scope?: "lists" | { prose: string }) => void,
  onStabilityTest: (scope?: "lists" | { prose: string }) => void,
  onReset: (scope?: "lists" | { prose: string }) => void,
  onOpenFindings: (scope?: "lists" | { prose: string }) => void,
) {
  const scopeArg: "lists" | { prose: string } | undefined =
    g.id === "lists"
      ? "lists"
      : g.id.startsWith("prose:")
        ? g.id === "prose:text"
          ? undefined
          : { prose: g.id.slice("prose:".length) }
        : undefined;

  let flag: React.ReactNode;
  let validateLabel: string;
  let validateClass: string;
  const validateDisabled = anyValidating;
  if (g.state === "passed") {
    flag = (
      <span className="rounded bg-success/10 text-success px-2 py-0.5 text-[10px] font-medium">
        ✓ Validated
      </span>
    );
    validateLabel = "Re-validate";
    validateClass =
      "rounded border border-border text-muted px-2 py-0.5 text-[10px] font-medium hover:bg-surface-hover disabled:opacity-50";
  } else if (g.state === "validating") {
    flag = (
      <span className="rounded bg-muted/10 text-muted px-2 py-0.5 text-[10px] font-medium">
        ⏳ Validating…
      </span>
    );
    validateLabel = "Validating…";
    validateClass =
      "rounded border border-border text-muted px-2 py-0.5 text-[10px] font-medium opacity-50";
  } else if (g.state === "attention") {
    flag = (
      <button
        onClick={() => onOpenFindings(scopeArg)}
        className="rounded bg-warning/10 text-warning px-2 py-0.5 text-[10px] font-medium hover:bg-warning/20 cursor-pointer"
        title="Click to view findings"
      >
        ⚠ {g.attentionCount} to resolve
      </button>
    );
    validateLabel = "Re-validate";
    validateClass =
      "rounded bg-warning/10 text-warning px-2 py-0.5 text-[10px] font-medium hover:bg-warning/20 disabled:opacity-50";
  } else {
    flag = (
      <span className="rounded bg-muted/10 text-muted px-2 py-0.5 text-[10px] font-medium">
        ⚪ Not validated
      </span>
    );
    validateLabel = "Validate";
    validateClass =
      "rounded bg-accent text-white px-2 py-0.5 text-[10px] font-medium hover:bg-accent/90 disabled:opacity-50";
  }
  return (
    <>
      {flag}
      <button
        onClick={() => onValidate(scopeArg)}
        disabled={validateDisabled}
        className={validateClass}
        title={
          g.state === "unvalidated"
            ? `Run quality check on ${g.label}`
            : "Re-validate after edits"
        }
      >
        {validateLabel}
      </button>
      <button
        onClick={() => onStabilityTest(scopeArg)}
        disabled={anyValidating}
        className="rounded border border-border text-muted px-1.5 py-0.5 text-[10px] font-medium hover:bg-surface-hover disabled:opacity-50"
        title={`Run 5 parallel validations of ${g.label} (diagnostic only; not persisted)`}
      >
        ×5
      </button>
      <button
        onClick={() => onReset(scopeArg)}
        disabled={anyValidating}
        className="rounded border border-border text-muted px-1.5 py-0.5 text-[10px] font-medium hover:bg-danger/10 hover:text-danger disabled:opacity-50"
        title={`Reset ${g.label} — clear canonical content + substrate + findings. Destructive.`}
      >
        ↺
      </button>
    </>
  );
}

function computeGroups(
  d: DescriptorRecord,
  validatingScopeId: string | null,
): ValidationGroup[] {
  const groups: ValidationGroup[] = [];
  const findings = d.metadata?.validationFindings?.findings ?? [];

  function stateFor(members: string[]): { state: GroupState; attentionCount: number } {
    const memberFindings = findings.filter((f) => members.includes(f.inputKey));
    if (memberFindings.length === 0) return { state: "unvalidated", attentionCount: 0 };
    const nonPass = memberFindings.filter((f) => f.verdict !== "pass");
    if (nonPass.length > 0) return { state: "attention", attentionCount: nonPass.length };
    // All findings on members pass. But if not every member has a finding,
    // we still treat that as unvalidated (the group hasn't been fully checked).
    const everyMemberHasFinding = members.every((m) =>
      findings.some((f) => f.inputKey === m),
    );
    if (!everyMemberHasFinding) return { state: "unvalidated", attentionCount: 0 };
    return { state: "passed", attentionCount: 0 };
  }

  if (!d.spec?.inputs) {
    // Non-decomposed: single prose group
    const members = ["text"];
    const { state, attentionCount } = stateFor(members);
    groups.push({
      id: "prose:text",
      label: d.label ?? d.key,
      members,
      state: validatingScopeId === "prose:text" ? "validating" : state,
      attentionCount,
      validatable: true,
    });
    return groups;
  }

  // Iterate inputs in spec order so groups render in declared sequence.
  // List inputs aggregate into ONE "lists" group; prose inputs each get
  // their own group; slot_composition inputs get their own group with
  // validatable: false (no validator yet — slots ARE substrate).
  const listKeys = d.spec.inputs
    .filter((i) => i.inputType === "list")
    .map((i) => i.key);
  let listsGroupAdded = false;
  for (const input of d.spec.inputs) {
    if (input.inputType === "list") {
      if (listsGroupAdded || listKeys.length === 0) continue;
      const { state, attentionCount } = stateFor(listKeys);
      groups.push({
        id: "lists",
        label: "Lists",
        members: listKeys,
        state: validatingScopeId === "lists" ? "validating" : state,
        attentionCount,
        validatable: true,
      });
      listsGroupAdded = true;
    } else if (input.inputType === "prose") {
      const id = `prose:${input.key}`;
      const { state, attentionCount } = stateFor([input.key]);
      groups.push({
        id,
        label: input.label ?? input.key,
        members: [input.key],
        state: validatingScopeId === id ? "validating" : state,
        attentionCount,
        validatable: true,
      });
    } else if (input.inputType === "slot_composition") {
      groups.push({
        id: `slots:${input.key}`,
        label: input.label ?? input.key,
        members: [input.key],
        state: "unvalidated",
        attentionCount: 0,
        validatable: false,
      });
    } else if (input.inputType === "angle_collection") {
      groups.push({
        id: `angles:${input.key}`,
        label: input.label ?? input.key,
        members: [input.key],
        state: "unvalidated",
        attentionCount: 0,
        validatable: false,
      });
    }
  }
  return groups;
}

function ValidationWarning({
  finding,
}: {
  finding: {
    verdict: "pass" | "warn" | "attention";
    reason: string;
    suggestion?: string | string[];
  };
}) {
  if (finding.verdict === "pass") return null;
  const palette =
    finding.verdict === "attention"
      ? { border: "border-warning/40", bg: "bg-warning/5", text: "text-warning", icon: "⚠" }
      : { border: "border-accent/40", bg: "bg-accent/5", text: "text-accent", icon: "ⓘ" };
  const hasSuggestion =
    typeof finding.suggestion === "string"
      ? finding.suggestion.trim().length > 0
      : Array.isArray(finding.suggestion) && finding.suggestion.length > 0;
  return (
    <div className={`space-y-1 rounded border ${palette.border} ${palette.bg} p-1.5`}>
      <p className={`text-[10px] ${palette.text}`}>
        {palette.icon} <strong>{finding.reason}</strong>
      </p>
      {hasSuggestion &&
        (Array.isArray(finding.suggestion) ? (
          <div className="text-[10px] text-muted">
            <span className="font-medium">Try:</span>
            <ol className="ml-4 list-decimal mt-0.5 space-y-0.5">
              {finding.suggestion.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-[10px] text-muted">
            <span className="font-medium">Try:</span> {finding.suggestion}
          </p>
        ))}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  extracting: "bg-accent/10 text-accent",
  extracted: "bg-success/10 text-success",
  failed: "bg-danger/10 text-danger",
  stale: "bg-warning/10 text-warning",
};

export function BrandIdentityContent({
  siteId,
  domain = "all",
}: {
  siteId: string;
  /**
   * Filter the descriptor render loop to a single brand-identity domain
   * (strategic / verbal / visual / sonic). "all" preserves the legacy
   * combined view served at /ops/brand-identity. The domain-specific
   * sub-routes pass the corresponding BrandDomain value. Completion stats
   * + quality gate scope to the filtered set automatically.
   *
   * Engine-generated descriptors (statistical bucket — populated by the
   * strategic-recommendation approve action) render as a per-descriptor
   * read-only view INSIDE their domain page, rather than as a separate
   * bucket page. This aligns navigation 1:1 with provisioning steps 8-11.
   */
  domain?: BrandDomain | "all";
}) {
  const [data, setData] = useState<BrandIdentityData | null>(null);
  const [loading, setLoading] = useState(true);
  // Drafts can be string (single-textarea) OR object (decomposed sub-fields).
  const [drafts, setDrafts] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState<Record<string, unknown>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [assets, setAssets] = useState<PickerAsset[] | null>(null);
  const [dictatingKey, setDictatingKey] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [validatingKey, setValidatingKey] = useState<string | null>(null);
  // Stability test state — diagnostic per-descriptor multi-run, not persisted.
  const [stabilityKey, setStabilityKey] = useState<string | null>(null);
  const [stabilityRunning, setStabilityRunning] = useState(false);
  const [stabilityRuns, setStabilityRuns] = useState<
    Array<{
      findings: Array<{
        inputKey: string;
        verdict: "pass" | "warn" | "attention";
        reason: string;
        exemplars?: Array<{
          content: string;
          source: "existing" | "rephrased" | "new";
          fromSlot?: number;
        }>;
        suggestion?: string | string[];
      }>;
      error?: string;
    }>
  >([]);
  // Exemplar modal — opens when validation surfaces non-pass findings WITH exemplars.
  // Display-only (no auto-write; owner copies and manually edits their fields).
  const [approvalKey, setApprovalKey] = useState<string | null>(null);
  // Per [[descriptor-design-protocol]]: when validation was scoped (lists or a
  // single prose), the modal filters findings to that scope so the owner sees
  // exactly what they just re-validated, not mixed with findings from other
  // unrelated scopes. `null` = whole-descriptor (legacy/non-decomposed flow).
  const [approvalScope, setApprovalScope] = useState<string | null>(null);
  const [approvalCacheInfo, setApprovalCacheInfo] = useState<{
    cached: boolean;
    checkedAt: string;
  } | null>(null);

  // Refs the dictation callback reads (it closes over stale state otherwise).
  const draftsRef = useRef<Record<string, unknown>>({});
  const dictatingKeyRef = useRef<string | null>(null);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  const saveValue = useCallback(
    async (key: string, value: unknown) => {
      setSavingKey(key);
      try {
        const res = await fetch("/api/ops/brand-identity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ siteId, key, declared: value }),
        });
        if (res.ok) {
          const oldValue = saved[key];
          setSaved((prev) => ({ ...prev, [key]: value }));
          // Scope-aware stale-on-edit: the server keeps findings for scopes
          // whose declared content didn't change. The client must mirror that
          // logic — previously we nuked the whole validationFindings object,
          // which incorrectly flipped unrelated groups (e.g. editing example
          // also reset the Lists chip).
          setData((prev) =>
            !prev
              ? prev
              : {
                  ...prev,
                  descriptors: prev.descriptors.map((d) => {
                    if (d.key !== key) return d;
                    const findings = d.metadata?.validationFindings?.findings;
                    if (!findings || findings.length === 0) return d;
                    const affected = computeAffectedScopesClient(
                      d.spec,
                      oldValue,
                      value,
                    );
                    if (affected.size === 0) return d; // no diff → keep all findings
                    const kept = findings.filter((f) => {
                      const fScope = inputKeyScopeClient(d.spec, f.inputKey);
                      return !affected.has(fScope);
                    });
                    const meta = { ...(d.metadata ?? {}) } as Record<
                      string,
                      unknown
                    >;
                    if (kept.length === 0) {
                      delete meta.validationFindings;
                    } else {
                      meta.validationFindings = {
                        ...d.metadata!.validationFindings!,
                        findings: kept,
                      };
                    }
                    return { ...d, metadata: meta };
                  }),
                },
          );
        } else {
          toast.error("Save failed");
        }
      } finally {
        setSavingKey(null);
      }
    },
    [siteId, saved],
  );

  // Forbidden-term map sourced from avoid's declared content. Two sources
  // merged: the NEW weasel-words shape (declared.weasel_words.*) and the
  // LEGACY per-set baselines (metadata.baselinesApplied). v1 of avoid lived
  // entirely on baselines; the decomposition (2026-06-06) moved it onto
  // declared with the consolidated 74-term taxonomy. Both sources contribute
  // until the legacy baselines path is retired for avoid descriptors.
  const forbiddenTerms: ForbiddenTerm[] = useMemo(() => {
    if (!data) return [];
    const avoidDesc = data.descriptors.find((d) => d.key === "avoid");

    // NEW PATH — weasel_words declared shape
    const weaselDeclared =
      avoidDesc?.declared && typeof avoidDesc.declared === "object" && !Array.isArray(avoidDesc.declared)
        ? ((avoidDesc.declared as Record<string, unknown>).weasel_words as
            | { weasel_words_applies?: boolean; weasel_words_allow_overrides?: string[] }
            | undefined)
        : undefined;
    const weaselTerms = forbiddenTermsFromWeaselWords(weaselDeclared ?? null);

    // LEGACY PATH — metadata.baselinesApplied (only fires if any are applied;
    // expected to drift to empty as brands migrate to the new declared shape).
    const legacyTerms = forbiddenTermsFromAvoid(avoidDesc?.metadata?.baselinesApplied);

    // Merge dedup-by-term (case-insensitive), preferring weasel-source labels
    // since they carry the consolidated category taxonomy.
    const merged = new Map<string, ForbiddenTerm>();
    for (const t of weaselTerms) {
      merged.set(t.term.toLowerCase(), t);
    }
    for (const t of legacyTerms) {
      const k = t.term.toLowerCase();
      if (!merged.has(k)) merged.set(k, t);
    }
    return Array.from(merged.values());
  }, [data]);

  const dictation = useDictation({
    siteId,
    onTranscript: (text) => {
      const key = dictatingKeyRef.current;
      if (!key) return;
      // v1: dictation only operates on string drafts (non-decomposed descriptors).
      // Decomposed descriptors don't render a mic button, so this branch shouldn't fire there.
      const existing = draftsRef.current[key];
      if (typeof existing !== "string") return;
      const next = existing.trim() ? `${existing.trimEnd()}\n${text}` : text;
      setDrafts((prev) => ({ ...prev, [key]: next }));
      void saveValue(key, next);
    },
    onError: (e) => toast.error(e.message),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ops/brand-identity?site_id=${siteId}`);
      if (!res.ok) {
        toast.error("Failed to load brand identity");
        return;
      }
      const d: BrandIdentityData = await res.json();
      setData(d);
      const initial: Record<string, unknown> = {};
      for (const desc of d.descriptors) {
        if (
          desc.spec?.inputs &&
          typeof desc.declared === "string" &&
          desc.declared.length > 0
        ) {
          // Legacy string value on a now-decomposed descriptor: stash the
          // existing prose into the `example` input if one exists (the catch-
          // all prose slot), else into the first prose input. Either way it
          // becomes visible and gets saved into the structured shape on next blur.
          const proseInput =
            desc.spec.inputs.find(
              (i) => i.key === "example" && i.inputType === "prose",
            ) ?? desc.spec.inputs.find((i) => i.inputType === "prose");
          initial[desc.key] = proseInput
            ? { [proseInput.key]: desc.declared }
            : { _legacy: desc.declared };
        } else {
          // Decomposed descriptors start as empty object; single-textarea ones as "".
          const fallback: unknown = desc.spec?.inputs ? {} : "";
          initial[desc.key] = desc.declared ?? fallback;
        }
      }
      setDrafts(initial);
      setSaved(initial);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    load();
    setPickerKey(null);
    // Eager-load the asset list so already-bound thumbnails render immediately.
    setAssets(null);
    (async () => {
      const res = await fetch(`/api/ops/brand-identity/asset?site_id=${siteId}`);
      if (res.ok) {
        const { assets: list } = await res.json();
        setAssets(list as PickerAsset[]);
      }
    })();
  }, [load, siteId]);

  function saveDeclared(key: string) {
    // Deep-compare via JSON.stringify — drafts may be objects (decomposed shape).
    if (JSON.stringify(drafts[key]) === JSON.stringify(saved[key])) return;
    void saveValue(key, drafts[key]);
  }

  function toggleDictate(key: string) {
    if (!dictation.supported) {
      toast.error("Microphone not supported in this browser");
      return;
    }
    if (dictation.state === "recording" && dictatingKeyRef.current === key) {
      void dictation.stop();
      return;
    }
    if (dictation.state === "idle" || dictation.state === "error") {
      dictatingKeyRef.current = key;
      setDictatingKey(key);
      void dictation.start();
    }
  }

  async function ensureAssets() {
    if (assets) return;
    const res = await fetch(`/api/ops/brand-identity/asset?site_id=${siteId}`);
    if (res.ok) {
      const { assets: list } = await res.json();
      setAssets(list as PickerAsset[]);
    }
  }

  function reportQualityState() {
    if (!data) return;
    const required = data.descriptors.filter((d) => REQUIRED_KEYS.has(d.key));

    // Required descriptors still missing content
    const unfilled = required.filter((d) => !isSatisfied(d));
    if (unfilled.length > 0) {
      const list = unfilled.map((d) => d.label ?? d.key).join(", ");
      toast.error(
        `${unfilled.length} required descriptor${unfilled.length === 1 ? "" : "s"} need content: ${list}`,
      );
      return;
    }

    // Filled but not yet all-pass validated
    const needsValidation = required.filter((d) => {
      const findings = d.metadata?.validationFindings?.findings;
      if (!findings || findings.length === 0) return true;
      return findings.some((f) => f.verdict !== "pass");
    });
    if (needsValidation.length > 0) {
      const list = needsValidation.map((d) => d.label ?? d.key).join(", ");
      toast.error(
        `${needsValidation.length} descriptor${needsValidation.length === 1 ? "" : "s"} need validation: ${list}`,
      );
      return;
    }

    toast.success("All required descriptors filled and validated ✓");
  }

  /**
   * Open the findings modal for a descriptor (optionally scoped). Used by
   * the attention-state chip click — owner clicks ⚠ to see what the findings
   * actually say (vs. only seeing "1 to resolve"). No LLM call; just reads
   * the persisted findings.
   */
  function openFindings(key: string, scope?: "lists" | { prose: string }) {
    const scopeId = !scope ? null : scope === "lists" ? "lists" : `prose:${scope.prose}`;
    setApprovalScope(scopeId);
    setApprovalKey(key);
    setApprovalCacheInfo(null); // not from a fresh validate; cached state assumed
  }

  /**
   * Reset owner_original (and dependent substrate, findings, declared) for
   * a group. Per [[brand-identity-schema]] reset semantics: used when the
   * owner wants to start over from scratch — typically after a hype-only
   * first attempt locked the substrate cache and they need a fresh canonical.
   * Destructive; confirm before firing.
   */
  async function runReset(
    key: string,
    scope?: "lists" | { prose: string },
  ) {
    const scopeLabel =
      !scope
        ? "this descriptor"
        : scope === "lists"
          ? "the lists group"
          : `the ${scope.prose} input`;
    const ok = window.confirm(
      `Reset will clear the canonical content, extracted substrate, and validation findings for ${scopeLabel}. Owner content for this scope will be deleted; you'll need to re-enter it. Continue?`,
    );
    if (!ok) return;
    setSavingKey(key);
    try {
      const res = await fetch("/api/ops/brand-identity/reset-original", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, key, ...(scope ? { scope } : {}) }),
      });
      if (res.ok) {
        await load();
        toast.success("Reset complete — re-enter content to start over.");
      } else {
        toast.error("Reset failed");
      }
    } finally {
      setSavingKey(null);
    }
  }

  async function runStabilityTest(
    key: string,
    scope?: "lists" | { prose: string },
    n = 5,
  ) {
    const scopeId = !scope ? "all" : scope === "lists" ? "lists" : `prose:${scope.prose}`;
    setStabilityKey(`${key}::${scopeId}`);
    setStabilityRunning(true);
    setStabilityRuns([]);
    try {
      const res = await fetch("/api/ops/brand-identity/validate-stability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, key, n, ...(scope ? { scope } : {}) }),
      });
      if (res.ok) {
        const { results } = (await res.json()) as { results: typeof stabilityRuns };
        setStabilityRuns(results);
      } else {
        toast.error("Stability test failed");
        setStabilityKey(null);
      }
    } finally {
      setStabilityRunning(false);
    }
  }

  function closeStability() {
    setStabilityKey(null);
    setStabilityRuns([]);
  }

  function closeApproval() {
    setApprovalKey(null);
    setApprovalScope(null);
    setApprovalCacheInfo(null);
  }

  async function acceptAllExemplars(key: string) {
    if (!data) return;
    const desc = data.descriptors.find((d) => d.key === key);
    if (!desc) return;
    const findings = desc.metadata?.validationFindings?.findings ?? [];
    // Scope-aware: when accept is invoked from a scoped modal, only commit
    // exemplars for inputs in that scope. Inputs outside the scope keep their
    // existing declared value untouched.
    const scopeMembers = approvalScope
      ? new Set(scopeMemberKeysFromSpec(desc.spec, approvalScope))
      : null;
    const scoped = scopeMembers
      ? findings.filter((f) => scopeMembers.has(f.inputKey))
      : findings;
    const actionable = scoped.filter(
      (f) => f.verdict !== "pass" && (f.exemplars?.length ?? 0) > 0,
    );
    if (actionable.length === 0) {
      closeApproval();
      return;
    }

    // Build merged declared object — start with current declared, replace each
    // input that has exemplars. Inputs without findings or with pass verdict
    // are preserved as-is.
    const current = saved[key] ?? drafts[key] ?? {};
    const next: Record<string, unknown> =
      current && typeof current === "object" && !Array.isArray(current)
        ? { ...(current as Record<string, unknown>) }
        : {};
    const provenance: Record<
      string,
      "owner_typed" | "ai_suggested" | Array<"owner_typed" | "ai_suggested">
    > = {};

    for (const finding of actionable) {
      const input = desc.spec?.inputs?.find((i) => i.key === finding.inputKey);
      // slot_composition inputs never appear in findings (validator skips them);
      // safe to narrow to list|prose here.
      const rawType = input?.inputType ?? "prose";
      const inputType: "list" | "prose" = rawType === "list" ? "list" : "prose";
      const currentRaw = (() => {
        if (inputType !== "prose") return undefined;
        const decl = saved[key] ?? drafts[key];
        if (typeof decl === "string") return decl;
        if (decl && typeof decl === "object" && !Array.isArray(decl)) {
          const v = (decl as Record<string, unknown>)[finding.inputKey];
          return typeof v === "string" ? v : undefined;
        }
        return undefined;
      })();
      const exemplars = primaryExemplars(
        normalizeExemplars(finding, inputType),
        inputType,
        currentRaw,
      );
      if (exemplars.length === 0) continue;

      if (inputType === "list") {
        next[finding.inputKey] = exemplars.map((e) => e.content);
        provenance[finding.inputKey] = exemplars.map((e) =>
          e.source === "existing" ? "owner_typed" : "ai_suggested",
        );
      } else {
        // prose: take the first exemplar (validator returns 1 per the schema)
        next[finding.inputKey] = exemplars[0].content;
        provenance[finding.inputKey] =
          exemplars[0].source === "existing" ? "owner_typed" : "ai_suggested";
      }
    }

    setSavingKey(key);
    try {
      const res = await fetch("/api/ops/brand-identity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, key, declared: next, provenance }),
      });
      if (res.ok) {
        setSaved((prev) => ({ ...prev, [key]: next }));
        setDrafts((prev) => ({ ...prev, [key]: next }));
        setData((prev) =>
          !prev
            ? prev
            : {
                ...prev,
                descriptors: prev.descriptors.map((d) => {
                  if (d.key !== key) return d;
                  const meta = { ...(d.metadata ?? {}) } as Record<string, unknown>;
                  delete meta.validationFindings;
                  return { ...d, declared: next, metadata: meta };
                }),
              },
        );
        toast.success("Suggestions accepted — re-validate when ready");
        closeApproval();
      } else {
        toast.error("Accept failed");
      }
    } finally {
      setSavingKey(null);
    }
  }

  /**
   * Scope-aware descriptor validation. Per [[descriptor-design-protocol]] each
   * decomposed descriptor has multiple groups (one lists + one per prose); the
   * UI surfaces per-group triggers so the owner re-validates only what they
   * edited. `scope` undefined means "all groups" (the original whole-descriptor
   * behavior, used by `Validate` on non-decomposed descriptors).
   */
  async function runDescriptorValidation(
    key: string,
    scope?: "lists" | { prose: string },
  ) {
    const scopeId = !scope
      ? "all"
      : scope === "lists"
        ? "lists"
        : `prose:${scope.prose}`;
    const tag = `${key}::${scopeId}`;
    setValidatingKey(tag);
    try {
      const res = await fetch("/api/ops/brand-identity/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, key, ...(scope ? { scope } : {}) }),
      });
      if (res.ok) {
        const { results } = (await res.json()) as {
          results: Array<{
            findings: Array<{
              inputKey: string;
              verdict: "pass" | "warn" | "attention";
              reason: string;
              exemplars?: Array<{
                content: string;
                source: "existing" | "rephrased" | "new";
                fromSlot?: number;
              }>;
              suggestion?: string | string[];
            }>;
            cached?: boolean;
          }>;
        };
        const r0 = results[0];
        const findings = r0?.findings ?? [];
        const nonPass = findings.filter((f) => f.verdict !== "pass");
        // Actionable = any non-pass finding with exemplars (or legacy
        // suggestion). Non-actionable = non-pass without exemplars (e.g. the
        // empty-substrate short-circuit). Both should surface to the owner.
        const actionable = nonPass.filter((f) => {
          if (Array.isArray(f.exemplars) && f.exemplars.length > 0) return true;
          if (typeof f.suggestion === "string" && f.suggestion.trim().length > 0) return true;
          if (Array.isArray(f.suggestion) && f.suggestion.length > 0) return true;
          return false;
        });
        const warnings = nonPass.length;

        await load();

        if (nonPass.length > 0) {
          setApprovalCacheInfo({
            cached: !!r0?.cached,
            checkedAt: (r0 as { checkedAt?: string })?.checkedAt ?? "",
          });
          setApprovalScope(scopeId === "all" ? null : scopeId);
          setApprovalKey(key);
          const msg = (() => {
            if (actionable.length === 0) {
              // Non-actionable finding — surface the reason directly.
              return `${key}: ${nonPass[0].reason || "needs attention — open the findings to review."}`;
            }
            return r0?.cached
              ? `${key}: showing cached findings (no LLM call). ${warnings} to review.`
              : `${key}: ${warnings} finding${warnings === 1 ? "" : "s"} — review.`;
          })();
          if (actionable.length === 0) toast.error(msg);
          else toast.success(msg);
          return;
        }

        // Pass case — no findings flagged.
        if (r0?.cached) {
          toast.success(`${key}: cached pass ✓ (no LLM call).`);
        } else {
          toast.success(`${key}: passed ✓`);
        }
      } else {
        toast.error("Validation failed");
      }
    } finally {
      setValidatingKey(null);
    }
  }

  async function runExtraction() {
    setExtracting(true);
    try {
      const res = await fetch("/api/ops/brand-identity/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (res.ok) {
        const r = (await res.json()) as {
          ran: { status: string }[];
          skipped: string[];
        };
        const failed = r.ran.filter((x) => x.status === "failed").length;
        toast.success(
          `Extraction (stub): ${r.ran.length - failed} ok, ${failed} failed, ${r.skipped.length} skipped`,
        );
        await load();
      } else {
        toast.error("Extraction failed");
      }
    } finally {
      setExtracting(false);
    }
  }

  async function toggleBaseline(
    key: string,
    baselineId: string,
    applying: boolean,
  ) {
    if (!data) return;
    const desc = data.descriptors.find((d) => d.key === key);
    if (!desc) return;
    const applicableIds = baselinesFor(key).map((b) => b.id);
    // null/missing baselinesApplied = all applicable apply (default-on)
    const current = desc.metadata?.baselinesApplied ?? applicableIds;
    const newApplied = applying
      ? Array.from(new Set([...current, baselineId]))
      : current.filter((id) => id !== baselineId);

    const apply = (list: string[]) =>
      setData((prev) =>
        !prev
          ? prev
          : {
              ...prev,
              descriptors: prev.descriptors.map((dx) =>
                dx.key !== key
                  ? dx
                  : {
                      ...dx,
                      metadata: { ...(dx.metadata ?? {}), baselinesApplied: list },
                    },
              ),
            },
      );

    apply(newApplied);
    const res = await fetch("/api/ops/brand-identity/baselines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, key, applied: newApplied }),
    });
    if (!res.ok) {
      apply(current); // revert
      toast.error("Baseline update failed");
    }
  }

  async function toggleBinding(key: string, assetId: string, bound: boolean) {
    // Optimistic flip — update local state immediately, reconcile only on failure.
    const flip = (currentlyBound: boolean) =>
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          descriptors: prev.descriptors.map((desc) =>
            desc.key !== key
              ? desc
              : {
                  ...desc,
                  assets: currentlyBound
                    ? desc.assets.filter((a) => a.assetId !== assetId)
                    : [
                        ...desc.assets,
                        { assetId, role: null, position: desc.assets.length },
                      ],
                },
          ),
        };
      });
    flip(bound);
    const res = await fetch("/api/ops/brand-identity/asset", {
      method: bound ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId, key, assetId }),
    });
    if (!res.ok) {
      flip(!bound); // revert
      toast.error("Asset update failed");
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
    return <p className="p-6 text-xs text-muted">Failed to load brand identity.</p>;
  }

  // Interview shows DECLARED descriptors only; extracted-lean ones are produced
  // by the extraction workflow and reviewed separately.
  const allDeclared = data.descriptors.filter((d) => d.spec?.lean === "declared");
  const allRequired = data.descriptors.filter((d) => REQUIRED_KEYS.has(d.key));
  // Domain filter — "all" preserves the legacy combined view;
  // strategic / verbal / visual / sonic scope to a single brand domain.
  // Stats below compute against the filtered set so each domain page shows
  // its own completion ratio. Engine-generated (statistical-bucket)
  // descriptors are included in the filter but render as read-only per
  // [[brand-identity-bucket-to-domain-restructure]] (2026-06-11).
  const declared =
    domain === "all"
      ? allDeclared
      : allDeclared.filter((d) => d.spec?.domain === domain);
  const required =
    domain === "all"
      ? allRequired
      : allRequired.filter((d) => d.spec?.domain === domain);
  // Required-count + quality gate exclude statistical-bucket descriptors —
  // they're populated by the strategic-recommendation approve flow, not by
  // owner-typed input + validation. Their completion signal is "bundle
  // committed" (declared !== null), not "validation passes". Owner-curated
  // (non-statistical) required descriptors still drive the gate.
  const ownerCurated = required.filter((d) => !isStatistical(d.key));
  const requiredCount = ownerCurated.length;
  const satisfied = ownerCurated.filter(isSatisfied).length;
  const complete = requiredCount > 0 && satisfied === requiredCount;

  // Quality gate: every owner-curated required descriptor needs
  // validationFindings with all-pass verdicts. Hard-pass-only per locked
  // methodology — no "Keep mine" acknowledgment in v1.
  let totalFindings = 0;
  let totalWarnings = 0;
  let qualityReadyCount = 0;
  for (const d of ownerCurated) {
    const findings = d.metadata?.validationFindings?.findings;
    if (!findings) continue;
    totalFindings += findings.length;
    const warns = findings.filter((f) => f.verdict !== "pass").length;
    totalWarnings += warns;
    if (warns === 0) qualityReadyCount += 1;
  }
  const qualityPass = complete && qualityReadyCount === requiredCount;
  const extractGateOpen = complete && qualityPass;

  return (
    <div className="p-4 space-y-4 pb-12">
      {/* Domain tab strip — visible on every variant; "all" view shows no
          tab as active (signals "you're on the legacy combined view"). */}
      <DomainTabs domain={domain} />

      {/* Completion gate */}
      <div
        className={`rounded-xl border p-4 shadow-card ${
          complete ? "border-success/40 bg-success/5" : "border-border bg-surface"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-semibold">Brand Identity Interview</h3>
            <p className="text-[10px] text-muted mt-0.5">
              Declared inputs feed extraction. Dictate the open ones — raw spoken input is
              the signal; the transcript appends to the field.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                complete ? "bg-success/10 text-success" : "bg-surface-hover text-foreground"
              }`}
            >
              Required: {satisfied}/{requiredCount}
            </span>
            <span
              className={`rounded px-2 py-0.5 text-[10px] font-medium ${
                qualityPass
                  ? "bg-success/10 text-success"
                  : totalWarnings > 0
                    ? "bg-warning/10 text-warning"
                    : "bg-surface-hover text-foreground"
              }`}
              title={
                qualityPass
                  ? "All required descriptors have passing findings"
                  : totalFindings === 0
                    ? "Quality check has not been run yet"
                    : `${totalWarnings} finding${totalWarnings === 1 ? "" : "s"} to resolve`
              }
            >
              Quality: {qualityPass ? "passed" : totalFindings === 0 ? "not run" : `${totalWarnings} to resolve`}
            </span>
            <button
              onClick={reportQualityState}
              className="rounded border border-border text-foreground px-3 py-1 text-[10px] font-medium hover:bg-surface-hover"
              title="Surface what still needs content or validation. Validation itself is done per-card."
            >
              Check status
            </button>
            <button
              onClick={runExtraction}
              disabled={extracting || !extractGateOpen}
              className="rounded bg-accent text-white px-3 py-1 text-[10px] font-medium hover:opacity-90 disabled:opacity-50"
              title={
                !complete
                  ? "Required descriptors not yet filled"
                  : !qualityPass
                    ? "Quality check must pass before extraction"
                    : "Run extraction — currently a stub that fills placeholder extracted values"
              }
            >
              {extracting ? "Extracting…" : "Run extraction (stub)"}
            </button>
          </div>
        </div>
      </div>

      {stabilityKey && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-xl border border-border shadow-card p-4 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold">
                Stability test — <code>{stabilityKey}</code> ({stabilityRuns.length || 0} runs)
              </h3>
              <button
                onClick={closeStability}
                className="text-muted hover:text-foreground text-xs"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {stabilityRunning && (
              <p className="text-[10px] text-muted">Running 5 validations in parallel…</p>
            )}
            {!stabilityRunning && stabilityRuns.length > 0 && (() => {
              // Group findings by inputKey across all runs.
              const inputKeys = Array.from(
                new Set(stabilityRuns.flatMap((r) => r.findings.map((f) => f.inputKey))),
              );
              const verdictPalette: Record<string, string> = {
                pass: "bg-success/10 text-success",
                warn: "bg-accent/10 text-accent",
                attention: "bg-warning/10 text-warning",
              };
              return (
                <div className="space-y-3">
                  {inputKeys.map((ik) => (
                    <div key={ik} className="space-y-1">
                      <p className="text-[10px] font-semibold text-foreground">
                        Input: <code>{ik}</code>
                      </p>
                      <div className="space-y-1">
                        {stabilityRuns.map((run, idx) => {
                          const f = run.findings.find((ff) => ff.inputKey === ik);
                          if (!f) {
                            return (
                              <div key={idx} className="text-[10px] text-muted">
                                Run {idx + 1}: <em>not present</em>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={idx}
                              className="flex items-start gap-2 text-[10px]"
                            >
                              <span className="text-muted w-10">Run {idx + 1}:</span>
                              <span
                                className={`rounded px-1.5 py-0.5 font-medium ${verdictPalette[f.verdict] ?? "bg-muted/20 text-muted"}`}
                              >
                                {f.verdict}
                              </span>
                              <span className="flex-1 text-foreground">
                                {f.reason || <em className="text-muted">(no reason)</em>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <details className="text-[10px] text-muted">
                    <summary className="cursor-pointer hover:text-foreground">
                      Full JSON (suggestions + provenance)
                    </summary>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[9px] bg-background border border-border rounded p-2">
                      {JSON.stringify(stabilityRuns, null, 2)}
                    </pre>
                  </details>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {approvalKey &&
        (() => {
          const desc = data.descriptors.find((d) => d.key === approvalKey);
          if (!desc) return null;
          const findings = desc.metadata?.validationFindings?.findings ?? [];
          // Scope-filter the findings shown in the modal so a scoped validation
          // run surfaces only its own findings (not findings from other scopes
          // that may still be present in metadata).
          const scopeMembers = approvalScope
            ? new Set(scopeMemberKeysFromSpec(desc.spec, approvalScope))
            : null;
          const scoped = scopeMembers
            ? findings.filter((f) => scopeMembers.has(f.inputKey))
            : findings;
          const actionableFindings = scoped.filter((f) => f.verdict !== "pass");
          if (actionableFindings.length === 0) return null;

          // Order findings by input position when decomposed; else as-is.
          const orderMap: Record<string, number> = {};
          (desc.spec?.inputs ?? []).forEach((i, idx) => {
            orderMap[i.key] = idx;
          });
          const sortedFindings = [...actionableFindings].sort(
            (a, b) =>
              (orderMap[a.inputKey] ?? 999) - (orderMap[b.inputKey] ?? 999),
          );

          return (
            <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
              <div className="bg-surface rounded-xl border border-border shadow-card p-4 max-w-4xl w-full max-h-[85vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold">
                    Quality exemplars — <code>{desc.label ?? desc.key}</code>
                  </h3>
                  <button
                    onClick={closeApproval}
                    className="text-muted hover:text-foreground text-xs"
                    aria-label="Close"
                  >
                    ✕
                  </button>
                </div>
                {approvalCacheInfo?.cached && (
                  <div className="rounded border border-accent/40 bg-accent/5 p-1.5 mb-3">
                    <p className="text-[10px] text-accent">
                      <strong>ⓘ Cached findings</strong> — no new LLM call was made.
                      {approvalCacheInfo.checkedAt && (
                        <> Last checked: {approvalCacheInfo.checkedAt}.</>
                      )}{" "}
                      Edit any sub-field to refresh.
                    </p>
                  </div>
                )}
                {(() => {
                  // Helper text varies by whether any finding carries exemplars
                  // the owner can accept. Non-actionable findings (empty
                  // substrate, etc.) need different guidance than rephrase
                  // suggestions.
                  const anyExemplars = sortedFindings.some((f) => {
                    const input = desc.spec?.inputs?.find((i) => i.key === f.inputKey);
                    const rawType = input?.inputType ?? "prose";
                    const inputType: "list" | "prose" =
                      rawType === "list" ? "list" : "prose";
                    return (
                      primaryExemplars(normalizeExemplars(f, inputType), inputType).length > 0
                    );
                  });
                  if (anyExemplars) {
                    return (
                      <p className="text-[10px] text-muted mb-3">
                        Exemplars demonstrate the <strong>shape</strong> of strong content
                        for this descriptor. <strong>Accept all suggestions</strong> below
                        replaces the inputs flagged here with these exemplars; inputs that
                        passed are left as-is.
                      </p>
                    );
                  }
                  return (
                    <p className="text-[10px] text-muted mb-3">
                      One or more inputs need attention. No automatic exemplar is
                      available — the reason below explains what to do next (typically:
                      edit your canonical content, or use Reset to start over).
                    </p>
                  );
                })()}
                <div className="space-y-4">
                  {sortedFindings.map((finding) => {
                    const input = desc.spec?.inputs?.find(
                      (i) => i.key === finding.inputKey,
                    );
                    const rawType = input?.inputType ?? "prose";
                    const inputType: "list" | "prose" =
                      rawType === "list" ? "list" : "prose";
                    const currentRaw = (() => {
                      if (inputType !== "prose") return undefined;
                      const decl = desc.declared;
                      if (typeof decl === "string") return decl;
                      if (decl && typeof decl === "object" && !Array.isArray(decl)) {
                        const v = (decl as Record<string, unknown>)[finding.inputKey];
                        return typeof v === "string" ? v : undefined;
                      }
                      return undefined;
                    })();
                    const exemplars = primaryExemplars(
                      normalizeExemplars(finding, inputType),
                      inputType,
                      currentRaw,
                    );
                    const fromList = exemplars.filter(
                      (e) => e.source === "existing" || e.source === "rephrased",
                    );
                    const fresh = exemplars.filter((e) => e.source === "new");
                    return (
                      <div key={finding.inputKey} className="space-y-2">
                        <p className="text-[10px] font-semibold">
                          {input?.label ?? finding.inputKey}
                          <span className="font-normal text-muted">
                            {" "}
                            — {finding.reason}
                          </span>
                        </p>

                        {fromList.length > 0 && (
                          <div className="space-y-1 pl-2 border-l-2 border-success/40">
                            <p className="text-[10px] text-success font-medium">
                              From your list:
                            </p>
                            {fromList.map((e, i) => {
                              const isRephrased = e.source === "rephrased";
                              return (
                                <div
                                  key={i}
                                  className="flex items-start gap-2 text-[10px]"
                                >
                                  <span className="text-success w-4 shrink-0">
                                    {isRephrased ? "✎" : "★"}
                                  </span>
                                  <span className="flex-1">
                                    {typeof e.fromSlot === "number" && (
                                      <span className="text-muted">
                                        Slot {e.fromSlot + 1}
                                        {isRephrased
                                          ? " (sharpened): "
                                          : " (already strong): "}
                                      </span>
                                    )}
                                    <span className="text-foreground">{e.content}</span>
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {fresh.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-muted font-medium">
                              {fromList.length > 0
                                ? "New exemplars to consider:"
                                : "Exemplars to consider:"}
                            </p>
                            {fresh.map((e, i) => (
                              <div
                                key={i}
                                className="flex items-start gap-2 text-[10px]"
                              >
                                <span className="text-muted w-4 text-right shrink-0">
                                  {i + 1}.
                                </span>
                                <span className="flex-1 text-foreground">
                                  {e.content}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex items-center justify-end gap-2 mt-4">
                  <button
                    onClick={closeApproval}
                    className="rounded border border-border px-3 py-1 text-[10px] font-medium hover:bg-surface-hover"
                  >
                    Close
                  </button>
                  {(() => {
                    // Show Accept All only when at least one finding actually
                    // carries exemplars. Non-actionable findings (e.g. the
                    // empty-substrate short-circuit) have no exemplars to
                    // commit — hide the button to avoid an empty action.
                    const hasAnyExemplars = sortedFindings.some((f) => {
                      const input = desc.spec?.inputs?.find((i) => i.key === f.inputKey);
                      const rawType = input?.inputType ?? "prose";
                      const inputType: "list" | "prose" =
                        rawType === "list" ? "list" : "prose";
                      const exs = primaryExemplars(
                        normalizeExemplars(f, inputType),
                        inputType,
                      );
                      return exs.length > 0;
                    });
                    if (!hasAnyExemplars) return null;
                    return (
                      <button
                        onClick={() => void acceptAllExemplars(approvalKey)}
                        disabled={savingKey === approvalKey}
                        className="rounded bg-accent text-white px-3 py-1 text-[10px] font-medium hover:bg-accent/90 disabled:opacity-50"
                      >
                        {savingKey === approvalKey ? "Accepting…" : "Accept all suggestions"}
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
          );
        })()}

      {PHASE_ORDER.map((phase) => {
        const group = declared
          .filter((d) => (d.spec?.phase ?? 99) === phase)
          .sort((a, b) => a.position - b.position);
        if (group.length === 0) return null;
        return (
          <div key={phase} className="space-y-2">
            <div className="px-1">
              <h4 className="text-[10px] uppercase tracking-wide text-muted">
                Phase {phase} — {PHASE_LABELS[phase]}
              </h4>
              <p className="text-[9px] text-muted/70 mt-0.5">
                {PHASE_DESCRIPTIONS[phase]}
              </p>
            </div>
            <div className="space-y-3">
              {group.map((d) =>
                // Per-descriptor fork: statistical-bucket descriptors (engine-
                // generated via strategic-recommendation approve flow) render
                // read-only inside their domain page. Owner-curated descriptors
                // render the regular editable DescriptorCard. This is what
                // dissolves the bucket/domain navigation mismatch — tagline
                // renders on /verbal with the engine-generated badge; proof
                // renders on /strategic with the regular editor.
                isStatistical(d.key) ? (
                  <StatisticalDescriptorReadOnly key={d.key} descriptor={d} />
                ) : (
                  <DescriptorCard
                    key={d.key}
                    d={d}
                    siteId={siteId}
                    draft={drafts[d.key]}
                    isSaving={savingKey === d.key}
                    isDirty={
                      JSON.stringify(drafts[d.key]) !== JSON.stringify(saved[d.key])
                    }
                    required={REQUIRED_KEYS.has(d.key)}
                    pickerOpen={pickerKey === d.key}
                    assets={assets}
                    dictationSupported={dictation.supported}
                    dictationActive={dictatingKey === d.key}
                    dictationState={dictation.state}
                    dictationElapsedMs={dictation.elapsedMs}
                    onDictate={() => toggleDictate(d.key)}
                    onChange={(v) => setDrafts((prev) => ({ ...prev, [d.key]: v }))} // v is string OR object depending on descriptor shape
                    onBlur={() => saveDeclared(d.key)}
                    onOpenPicker={async () => {
                      await ensureAssets();
                      setPickerKey(pickerKey === d.key ? null : d.key);
                    }}
                    onToggleAsset={(assetId, bound) => toggleBinding(d.key, assetId, bound)}
                    onToggleBaseline={(baselineId, optingOut) =>
                      toggleBaseline(d.key, baselineId, optingOut)
                    }
                    forbiddenTerms={forbiddenTerms}
                    validatingScopeId={
                      validatingKey?.startsWith(`${d.key}::`)
                        ? validatingKey.slice(`${d.key}::`.length)
                        : null
                    }
                    onValidate={(scope) => runDescriptorValidation(d.key, scope)}
                    onStabilityTest={(scope) => runStabilityTest(d.key, scope)}
                    onReset={(scope) => runReset(d.key, scope)}
                    onOpenFindings={(scope) => openFindings(d.key, scope)}
                    gbpCategories={d.key === "offer" ? data.gbpCategories : undefined}
                  />
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ============================================================================
// Statistical-bucket per-descriptor read-only render
// ============================================================================
//
// Per the locked direction (2026-06-01, see memory): no input form, no
// validation, no validation groups, no editing. Surfaces the committed
// strategic recommendation bundle for human + (future) LLM grading. The
// engine's confidence pills + reasoning + coherence ARE the per-element
// quality signal — no separate validator pass at this bucket level.
//
// 2026-06-11 restructure: the per-page wrapper (StatisticalReadOnlyView)
// retired; statistical descriptors now render via StatisticalDescriptorReadOnly
// directly inside the domain-page descriptor loop. See
// [[brand-identity-bucket-to-domain-restructure]].
//
// Each descriptor's declared JSONB carries the bundle element shape
// (per approveStrategicRecommendation). When declared is null the
// strategic recommendation hasn't been run/approved for that element.

function StatisticalDescriptorReadOnly({
  descriptor,
}: {
  descriptor: DescriptorRecord;
}) {
  const key = descriptor.key;
  const declared = descriptor.declared;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-medium">{descriptor.label || key}</h4>
          <p className="mt-0.5 text-[10px] text-muted capitalize">
            {key} · {descriptor.domain}
          </p>
        </div>
        {descriptor.status && (
          <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted">
            {descriptor.status}
          </span>
        )}
      </div>

      {declared === null ? (
        <EmptyStatisticalCard />
      ) : (
        <StatisticalBundleElement descriptorKey={key} value={declared} />
      )}
    </div>
  );
}

function EmptyStatisticalCard() {
  return (
    <div className="rounded border border-dashed border-border bg-background p-3 text-center">
      <p className="text-xs text-muted">No bundle element committed yet for this descriptor.</p>
      <p className="mt-1 text-[10px] text-muted">
        <Link href="/ops/strategic-recommendation" className="text-accent underline">
          Generate + approve a strategic recommendation
        </Link>{" "}
        to populate.
      </p>
    </div>
  );
}

function StatisticalBundleElement({
  descriptorKey,
  value,
}: {
  descriptorKey: string;
  value: unknown;
}) {
  // Per the approveStrategicRecommendation mapping, declared carries the
  // bundle element shape per descriptor key. Branch by key for typed render.
  switch (descriptorKey) {
    case "offer":
      return <OfferReadOnly value={value as OfferRec} />;
    case "audience":
      return <AudienceReadOnly value={value as AudienceRec} />;
    case "positioning":
      return <PositioningReadOnly value={value as PositioningRec} />;
    case "hooks":
      return <HooksReadOnly value={value as HookRec[]} />;
    case "tagline":
      return <TaglineReadOnly value={value as TaglineRec} />;
    case "cta":
      return <CtaReadOnly value={value as CtaRec} />;
    default:
      return <UnknownShapeReadOnly value={value} />;
  }
}

function ConfidencePill({ confidence }: { confidence: string | null | undefined }) {
  if (!confidence) return null;
  const cls =
    confidence === "high"
      ? "bg-success/10 text-success"
      : confidence === "medium"
        ? "bg-warning/10 text-warning"
        : "bg-muted/10 text-muted";
  return (
    <span
      className={`ml-2 rounded px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${cls}`}
    >
      {confidence}
    </span>
  );
}

function ReasoningBlock({
  reasoning,
  coherence,
}: {
  reasoning?: string;
  coherence?: string;
}) {
  if (!reasoning && !coherence) return null;
  return (
    <div className="mt-3 space-y-1 border-t border-border/40 pt-2">
      {reasoning && (
        <p className="text-[10px] text-muted">
          <span className="font-semibold">Reasoning:</span> {reasoning}
        </p>
      )}
      {coherence && (
        <p className="text-[10px] text-muted">
          <span className="font-semibold">Coherence:</span> {coherence}
        </p>
      )}
    </div>
  );
}

function OfferReadOnly({ value }: { value: OfferRec }) {
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs">{value.recommendation}</p>
        <ConfidencePill confidence={value.confidence} />
      </div>
      <ReasoningBlock reasoning={value.reasoning} coherence={value.coherence} />
    </div>
  );
}

function AudienceReadOnly({ value }: { value: AudienceRec }) {
  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <p>
          <span className="text-[10px] font-semibold text-muted">Primary:</span> {value.primary}
        </p>
        <ConfidencePill confidence={value.confidence} />
      </div>
      {/* Pains / triggers are substrate-library scope — populated by
          `business_pains` / `business_triggers` pipelines, not the
          strategic engine. See [[substrate-libraries-layer]]. */}
      <ReasoningBlock reasoning={value.reasoning} coherence={value.coherence} />
    </div>
  );
}

function PositioningReadOnly({ value }: { value: PositioningRec }) {
  const [lead, ...alternatives] = value.angles ?? [];
  return (
    <div>
      {!lead && <p className="text-xs text-muted">No positioning angle in bundle.</p>}
      {lead && (
        <div className="rounded border border-accent/40 bg-accent/5 p-3">
          <div className="flex items-start justify-between gap-2">
            <h5 className="text-xs font-semibold">
              <span className="mr-1 text-[10px] uppercase tracking-wide text-accent">
                Lead ·
              </span>
              {lead.label}
            </h5>
            <ConfidencePill confidence={lead.confidence} />
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div>
              <span className="text-[10px] font-semibold text-muted">Wedge:</span> {lead.wedge}
            </div>
            <div>
              <span className="text-[10px] font-semibold text-muted">Contrast:</span>{" "}
              {lead.contrast}
            </div>
            <div>
              <span className="text-[10px] font-semibold text-muted">Example:</span>{" "}
              <span className="italic">{lead.example}</span>
            </div>
            {lead.applies_to?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {lead.applies_to.map((a, i) => (
                  <span
                    key={i}
                    className="rounded bg-surface px-1.5 py-0.5 text-[9px] text-muted"
                  >
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {alternatives.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Alternative angles · ranked by evidence weight
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {alternatives.map((a, i) => (
              <div key={i} className="rounded border border-border bg-background p-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-semibold">{a.label}</p>
                  <ConfidencePill confidence={a.confidence} />
                </div>
                <p className="mt-1 text-[10px] text-muted">{a.wedge}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <ReasoningBlock reasoning={value.reasoning} coherence={value.coherence} />
    </div>
  );
}

function HooksReadOnly({ value }: { value: HookRec[] }) {
  if (!Array.isArray(value) || value.length === 0) {
    return <p className="text-xs text-muted">No hooks in bundle.</p>;
  }
  return (
    <ul className="space-y-2">
      {value.map((h, i) => (
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
  );
}

function TaglineReadOnly({ value }: { value: TaglineRec }) {
  if (value.recommendation === null) {
    return (
      <div className="rounded border border-border bg-background p-3 opacity-70">
        <p className="text-xs font-medium">Tagline deferred</p>
        <p className="mt-1 text-[10px] text-muted">
          {value.cause || "Recommendation engine returned no tagline."}
        </p>
        <ReasoningBlock reasoning={value.reasoning} coherence={value.coherence} />
      </div>
    );
  }
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-medium italic">&ldquo;{value.recommendation}&rdquo;</p>
        <ConfidencePill confidence={value.confidence ?? null} />
      </div>
      <ReasoningBlock reasoning={value.reasoning} coherence={value.coherence} />
    </div>
  );
}

function CtaReadOnly({ value }: { value: CtaRec }) {
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p>
            <span className="text-[10px] font-semibold text-muted">Primary:</span>{" "}
            {value.primary}
          </p>
          {value.secondary && (
            <p className="mt-1">
              <span className="text-[10px] font-semibold text-muted">Secondary:</span>{" "}
              {value.secondary}
            </p>
          )}
        </div>
        <ConfidencePill confidence={value.confidence} />
      </div>
      <ReasoningBlock reasoning={value.reasoning} coherence={value.coherence} />
    </div>
  );
}

function UnknownShapeReadOnly({ value }: { value: unknown }) {
  return (
    <div className="rounded border border-warning/30 bg-warning/5 p-2">
      <p className="text-[10px] text-warning">
        Unrecognized bundle shape — possibly legacy Creative-style declared data. Re-run the
        strategic recommendation to populate this descriptor with the canonical bundle shape.
      </p>
      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[9px] text-muted">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/**
 * Tab strip rendered at the top of every brand-identity page variant.
 * Routes to the 4 brand-identity domain pages (one per provisioning step
 * 8-11) plus the two observation pipelines. The legacy /ops/brand-identity
 * route renders with domain="all" and shows no domain tab as active.
 *
 * Restructure 2026-06-11: replaced Statistical / Creative bucket tabs
 * with the 4 domain tabs. Engine-generated descriptors (the Statistical
 * bucket) render read-only inside their domain page now — see
 * [[brand-identity-bucket-to-domain-restructure]].
 */
export function DomainTabs({
  domain,
}: {
  domain:
    | BrandDomain
    | "all"
    | "observation"
    | "competitive-analysis"
    | "readiness-findings";
}) {
  // Tab order follows the provisioning pipeline so the strip reads like
  // a phase narrative:
  //   Observation phase (steps 4-6): Public Presence → CMA → Readiness Findings
  //   Catalog phase    (steps 8-11): Strategic → Verbal → Visual → Sonic
  // CMA links out to /ops/competitive-analysis which lives under its own
  // top-level route. PPA + CMA bundle as siblings per
  // [[observation-driven-readiness-audit]].
  const domainTabs: Array<{ key: BrandDomain; href: string; label: string; count: number }> = [
    { key: "strategic", href: "/ops/brand-identity/strategic", label: "Strategic", count: 6 },
    { key: "verbal", href: "/ops/brand-identity/verbal", label: "Verbal", count: 6 },
    { key: "visual", href: "/ops/brand-identity/visual", label: "Visual", count: 6 },
    { key: "sonic", href: "/ops/brand-identity/sonic", label: "Sonic", count: 2 },
  ];
  const tabBase = "-mb-px border-b-2 px-3 py-2 text-xs font-medium";
  const tabActive = "border-accent text-foreground";
  const tabIdle = "border-transparent text-muted hover:text-foreground";
  return (
    <div className="flex items-center gap-1 border-b border-border flex-wrap">
      {/* ── Observation phase (intake / agency deliverables) ── */}
      <Link
        href="/ops/brand-identity/observation"
        className={`${tabBase} ${domain === "observation" ? tabActive : tabIdle}`}
      >
        Public Presence <span className="text-[9px] text-muted ml-1">agency deliverable</span>
      </Link>
      <Link
        href="/ops/competitive-analysis"
        className={`${tabBase} ${domain === "competitive-analysis" ? tabActive : tabIdle}`}
      >
        Competitive Analysis <span className="text-[9px] text-muted ml-1">agency deliverable</span>
      </Link>
      <Link
        href="/ops/brand-identity/readiness-findings"
        className={`${tabBase} ${domain === "readiness-findings" ? tabActive : tabIdle}`}
      >
        Readiness Findings <span className="text-[9px] text-muted ml-1">consultation deliverable</span>
      </Link>
      <span className="mx-2 text-[10px] text-muted/50">·</span>
      {/* ── Catalog phase (steps 8-11 brand-identity declaration) ── */}
      {domainTabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`${tabBase} ${domain === t.key ? tabActive : tabIdle}`}
        >
          {t.label} <span className="text-[9px] text-muted ml-1">({t.count})</span>
        </Link>
      ))}
      {domain === "all" && (
        <span className="ml-auto text-[9px] uppercase tracking-wide text-muted">
          Combined view · pick a domain above
        </span>
      )}
    </div>
  );
}

/**
 * Multi-select picker with custom-additions affordance. Renders the standard
 * options as checkboxes; custom entries in `value` that aren't in `options`
 * appear as additional checkboxes tagged "(custom)"; a text input below lets
 * the owner add their own. Per the industry-agnostic positioning design — the
 * universal options handle most cases; the free-text fallback handles
 * industry-specific values (e.g. heritage preservation, cooking workflow,
 * outcome certainty) without forcing them into every brand's picker list.
 */
function MultiPickerField({
  options,
  value,
  onChange,
  onBlur,
}: {
  options: string[];
  value: string[];
  onChange: (next: string[]) => void;
  onBlur: () => void;
}) {
  const [adding, setAdding] = useState("");
  const customs = value.filter((v) => !options.includes(v));
  const addCustom = () => {
    const trimmed = adding.trim();
    if (!trimmed) return;
    if (!value.includes(trimmed)) onChange([...value, trimmed]);
    setAdding("");
    onBlur();
  };
  return (
    <div className="space-y-0.5">
      {options.map((opt) => {
        const checked = value.includes(opt);
        return (
          <label
            key={opt}
            className="flex items-start gap-2 text-[10px] cursor-pointer"
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                const next = e.target.checked
                  ? [...value, opt]
                  : value.filter((v) => v !== opt);
                onChange(next);
              }}
              onBlur={onBlur}
              className="mt-0.5"
            />
            <span>{opt}</span>
          </label>
        );
      })}
      {customs.map((c) => (
        <label
          key={c}
          className="flex items-start gap-2 text-[10px] cursor-pointer"
        >
          <input
            type="checkbox"
            checked={true}
            onChange={() => {
              onChange(value.filter((v) => v !== c));
              onBlur();
            }}
            className="mt-0.5"
          />
          <span>
            {c} <span className="text-muted">(custom)</span>
          </span>
        </label>
      ))}
      <div className="flex items-center gap-1 mt-1">
        <input
          type="text"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Add your own..."
          className="flex-1 rounded border border-border bg-background px-2 py-0.5 text-[10px] focus:border-accent focus:outline-none"
        />
        <button
          onClick={addCustom}
          disabled={!adding.trim()}
          className="rounded border border-border text-muted px-2 py-0.5 text-[10px] font-medium hover:bg-surface-hover disabled:opacity-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

/**
 * Angle collection editor. Renders N angle cards, each with the same set of
 * sections × fields defined in `input.angleSchema`. Default count comes from
 * `input.defaultAngleCount` (or 3). Owner can add or remove angles.
 *
 * Storage shape:
 *   declared.<input.key> = { angles: AngleData[] }
 *   each AngleData = { [sectionKey]: { [fieldKey]: string | string[] } }
 *
 * Empty angles (no required fields filled) are kept in the array but ignored
 * downstream — the orchestrator only consumes angles whose required slots are
 * complete. This lets the owner sketch placeholders without committing.
 */
function BoolToggleOverridesEditor({
  descriptorKey,
  value,
  onChange,
  onBlur,
}: {
  descriptorKey: string;
  value: unknown;
  onChange: (next: unknown) => void;
  onBlur: () => void;
}) {
  // Currently the only bool_toggle_overrides descriptor is `avoid`, which
  // references the weasel-words taxonomy. The map below sets up the pattern
  // for additional toggle-and-override descriptors as they ship.
  if (descriptorKey !== "avoid") {
    return (
      <p className="text-xs text-red-600">
        bool_toggle_overrides taxonomy not configured for descriptor &quot;{descriptorKey}&quot;.
      </p>
    );
  }
  return <AvoidWeaselWordsEditor value={value} onChange={onChange} onBlur={onBlur} />;
}

function AvoidWeaselWordsEditor({
  value,
  onChange,
  onBlur,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  onBlur: () => void;
}) {
  const obj =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const applies = obj.weasel_words_applies !== false; // default true
  const overrides: string[] = useMemo(
    () =>
      Array.isArray(obj.weasel_words_allow_overrides)
        ? (obj.weasel_words_allow_overrides as unknown[]).filter(
            (s): s is string => typeof s === "string",
          )
        : [],
    [obj.weasel_words_allow_overrides],
  );

  const [customDraft, setCustomDraft] = useState("");
  const [browseOpen, setBrowseOpen] = useState(false);

  const overrideSet = useMemo(
    () => new Set(overrides.map((o) => o.toLowerCase())),
    [overrides],
  );
  const totalTerms = useMemo(() => totalWeaselWordsCount(), []);

  const setApplies = (next: boolean) => {
    onChange({ ...obj, weasel_words_applies: next });
    onBlur();
  };

  const addOverride = (term: string) => {
    const trimmed = term.trim();
    if (trimmed.length === 0) return;
    if (overrideSet.has(trimmed.toLowerCase())) return;
    onChange({
      ...obj,
      weasel_words_allow_overrides: [...overrides, trimmed],
    });
    onBlur();
  };

  const removeOverride = (term: string) => {
    onChange({
      ...obj,
      weasel_words_allow_overrides: overrides.filter((o) => o !== term),
    });
    onBlur();
  };

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex items-center justify-between gap-3 rounded border border-border bg-card p-2.5">
        <div>
          <div className="text-[11px] font-medium text-foreground">
            Apply weasel-words check
          </div>
          <p className="text-[10px] text-muted leading-relaxed">
            When on, the platform-wide weasel-words list flags{" "}
            <span className="font-medium">{totalTerms - overrides.length}</span> terms
            in your generated copy. {overrides.length > 0 && `${overrides.length} allowed override${overrides.length === 1 ? "" : "s"} active.`}
          </p>
        </div>
        <label className="inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={applies}
            onChange={(e) => setApplies(e.target.checked)}
            className="sr-only peer"
          />
          <span className="relative inline-flex h-5 w-9 items-center rounded-full bg-muted/40 transition-colors peer-checked:bg-accent/60">
            <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-background transition-transform translate-x-1 peer-checked:translate-x-4" />
          </span>
        </label>
      </div>

      {/* Banned Content TOS (static, non-editable) */}
      <div className="rounded border border-red-500/30 bg-red-500/5 p-2.5">
        <div className="text-[11px] font-medium text-red-700 dark:text-red-300 mb-1">
          Banned Content (platform TOS — non-negotiable)
        </div>
        <p className="text-[10px] text-muted leading-relaxed">
          Sexually explicit material, hate speech, threats of violence, and content
          targeting minors are never permitted in TracPost-generated outputs. This
          applies platform-wide and is not toggleable per brand.
        </p>
      </div>

      {/* Allow-list overrides */}
      {applies && (
        <div className="rounded border border-border bg-card p-2.5 space-y-2">
          <div>
            <div className="text-[11px] font-medium text-foreground">Allow these terms</div>
            <p className="text-[10px] text-muted leading-relaxed">
              Add terms from the weasel-words list that you specifically want to use.
              These will be excluded from the flagging for your brand only.
            </p>
          </div>
          {overrides.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {overrides.map((term) => (
                <span
                  key={term}
                  className="inline-flex items-center gap-1 rounded-full border border-accent/60 bg-accent/15 px-2 py-0.5 text-[11px] text-foreground"
                >
                  {term}
                  <button
                    type="button"
                    onClick={() => removeOverride(term)}
                    className="text-muted hover:text-foreground"
                    aria-label={`Remove ${term}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addOverride(customDraft);
                  setCustomDraft("");
                }
              }}
              placeholder="e.g. luxury"
              className="flex-1 max-w-xs rounded border border-border bg-background px-2 py-1 text-[11px] focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                addOverride(customDraft);
                setCustomDraft("");
              }}
              disabled={customDraft.trim().length === 0}
              className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-medium text-foreground hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Allow
            </button>
          </div>

          {/* Browse weasel-words by category (collapsed by default) */}
          <button
            type="button"
            onClick={() => setBrowseOpen((s) => !s)}
            className="text-[10px] text-muted hover:text-foreground underline"
          >
            {browseOpen ? "Hide" : "Browse"} the weasel-words list ({totalTerms} terms across {WEASEL_WORD_CATEGORIES.length} categories)
          </button>
          {browseOpen && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {WEASEL_WORD_CATEGORIES.map((cat) => (
                <div key={cat.key} className="space-y-1">
                  <div>
                    <span className="text-[10px] font-medium text-foreground">{cat.label}</span>
                    <span className="ml-2 text-[10px] text-muted">{cat.description}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {cat.terms.map((term) => {
                      const isOverride = overrideSet.has(term.toLowerCase());
                      return (
                        <button
                          key={term}
                          type="button"
                          onClick={() => (isOverride ? removeOverride(term) : addOverride(term))}
                          className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                            isOverride
                              ? "border-accent/60 bg-accent/15 text-foreground"
                              : "border-border bg-muted/15 text-muted hover:bg-muted/30 hover:text-foreground"
                          }`}
                          title={isOverride ? "Click to remove from allow-list" : "Click to add to allow-list"}
                        >
                          {term}
                        </button>
                      );
                    })}
                  </div>
                  {cat.allowed && cat.allowed.length > 0 && (
                    <div className="text-[9px] text-muted pl-2">
                      Use instead: {cat.allowed.join(", ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface LexiconAxisSubstrate {
  axis_key: string;
  label: string;
  terms: string[];
  hint?: string;
}

interface LexiconAxesSubstratePayload {
  axes: LexiconAxisSubstrate[];
  meta: {
    inputs_hash: string;
    generated_at: string;
    model: string;
    prompt_version: string;
  };
}

/** Sentinel value owner picks to mean "no preference between these terms". */
const INTERCHANGEABLE = "__interchangeable__";

function ScaffoldedPickerMatrixEditor({
  descriptorKey,
  siteId,
  value,
  onChange,
  onBlur,
}: {
  descriptorKey: string;
  siteId: string;
  value: unknown;
  onChange: (next: unknown) => void;
  onBlur: () => void;
}) {
  // For now lexicon is the only scaffolded_picker_matrix descriptor; this
  // map is set up so additional matrix descriptors can wire their endpoints
  // alongside as they ship.
  const endpoint =
    descriptorKey === "lexicon"
      ? "/api/ops/brand-identity/lexicon-axes"
      : null;

  const [substrate, setSubstrate] = useState<LexiconAxesSubstratePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});

  // value IS the picks map directly — the dispatcher already unwrapped
  // descriptor.declared[input.key] before passing it to this editor.
  const picks: Record<string, string> =
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value as Record<string, unknown>).filter(
            (e): e is [string, string] => typeof e[1] === "string",
          ),
        )
      : {};

  const refresh = useCallback(async () => {
    if (!endpoint) return;
    try {
      const r = await fetch(`${endpoint}?siteId=${siteId}`);
      if (!r.ok) throw new Error(`API ${r.status}`);
      const json = (await r.json()) as { axes: LexiconAxesSubstratePayload | null };
      setSubstrate(json.axes);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [siteId, endpoint]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = async () => {
    if (!endpoint) return;
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(endpoint, {
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
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const pick = (axisKey: string, term: string) => {
    onChange({ ...picks, [axisKey]: term });
    onBlur();
  };

  const commitCustom = (axisKey: string) => {
    const draft = (customDrafts[axisKey] ?? "").trim();
    if (draft.length === 0) return;
    pick(axisKey, draft);
    setCustomDrafts((s) => ({ ...s, [axisKey]: "" }));
  };

  if (!endpoint) {
    return (
      <p className="text-xs text-red-600">
        scaffolded_picker_matrix endpoint not configured for descriptor &quot;{descriptorKey}&quot;.
      </p>
    );
  }

  const totalAxes = substrate?.axes.length ?? 0;
  const filledAxes = Object.keys(picks).filter((k) => picks[k]?.length > 0).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={generate}
            disabled={generating}
            className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent/20 disabled:opacity-50"
          >
            {generating
              ? "Generating…"
              : substrate
              ? "Regenerate axes ⚙"
              : "Generate axes ⚙"}
          </button>
          {substrate && (
            <span className="text-[10px] text-muted">
              Generated {new Date(substrate.meta.generated_at).toLocaleString()}
            </span>
          )}
        </div>
        {substrate && (
          <span className="text-[10px] text-muted">
            {filledAxes} of {totalAxes} picked
          </span>
        )}
        {error && <span className="text-[10px] text-red-600">{error}</span>}
      </div>

      {loading && <p className="text-xs text-muted">Loading axes…</p>}

      {!loading && !substrate && (
        <p className="text-xs italic text-muted">
          No vocabulary axes generated yet. Click <em>Generate axes</em> above to scaffold
          the matrix with 6-10 industry-specific axes.
        </p>
      )}

      {substrate && (
        <div className="space-y-3">
          {substrate.axes.map((axis) => {
            const currentPick = picks[axis.axis_key] ?? "";
            const isInterchangeable = currentPick === INTERCHANGEABLE;
            const isCustom =
              currentPick.length > 0 &&
              currentPick !== INTERCHANGEABLE &&
              !axis.terms.includes(currentPick);
            const customDraft = customDrafts[axis.axis_key] ?? (isCustom ? currentPick : "");
            return (
              <div
                key={axis.axis_key}
                className="rounded border border-border bg-card p-2.5 space-y-1.5"
              >
                <div>
                  <span className="text-[11px] font-medium text-foreground">{axis.label}</span>
                  {axis.hint && (
                    <span className="ml-2 text-[10px] text-muted">{axis.hint}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {axis.terms.map((term) => {
                    const selected = currentPick === term;
                    return (
                      <button
                        key={term}
                        type="button"
                        onClick={() => pick(axis.axis_key, term)}
                        className={`rounded-full border px-2.5 py-0.5 text-[11px] transition-colors ${
                          selected
                            ? "border-accent/60 bg-accent/20 text-foreground"
                            : "border-border bg-muted/20 text-muted hover:bg-muted/40 hover:text-foreground"
                        }`}
                      >
                        {term}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => pick(axis.axis_key, INTERCHANGEABLE)}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] italic transition-colors ${
                      isInterchangeable
                        ? "border-slate-500/60 bg-slate-500/15 text-slate-700 dark:text-slate-300"
                        : "border-border bg-muted/20 text-muted hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    Interchangeable
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted">Custom:</span>
                  <input
                    type="text"
                    value={customDraft}
                    onChange={(e) =>
                      setCustomDrafts((s) => ({ ...s, [axis.axis_key]: e.target.value }))
                    }
                    onBlur={() => commitCustom(axis.axis_key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitCustom(axis.axis_key);
                      }
                    }}
                    placeholder="Your own term"
                    className={`flex-1 max-w-xs rounded border bg-background px-2 py-0.5 text-[11px] focus:outline-none ${
                      isCustom ? "border-accent/60" : "border-border focus:border-accent"
                    }`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Per-descriptor map of (substrate API endpoint, label). Adding a new
 * example_set_picker descriptor means adding an entry here.
 */
const EXAMPLE_SET_PICKER_SOURCES: Record<
  string,
  { endpoint: string; inputsAreReadyLabel?: string }
> = {
  mechanical_style: {
    endpoint: "/api/ops/brand-identity/mechanical-style-examples",
    inputsAreReadyLabel:
      "Generation uses voice_source + tone.attributes + GBP categories. Fill those first for best results — though the generator runs even if they're empty.",
  },
  environmental_look: {
    endpoint: "/api/ops/brand-identity/env-look-examples",
    inputsAreReadyLabel:
      "Generation uses your brand's source images (website screenshot + logo + GBP photos) plus the public_presence_observation substrate when available. Run the Public Presence Analysis first for sharper context.",
  },
  subject_style: {
    endpoint: "/api/ops/brand-identity/subject-style-examples",
    inputsAreReadyLabel:
      "Generation uses your brand's source images + the public_presence_observation substrate. Run the Public Presence Analysis first for sharper context.",
  },
  tagline: {
    endpoint: "/api/ops/brand-identity/tagline-examples",
    inputsAreReadyLabel:
      "Generation uses positioning + tone + voice_source + audience + lexicon picks. The picker depends on POSITIONING — without it the candidates fall back to generic industry patterns. If Public Presence Analysis observed a tagline already in use, it'll be included verbatim as one of the 3 candidates.",
  },
};

/**
 * Normalized example shape — the editor renders all variants from this. The
 * raw substrate (paragraph-based for text descriptors, image-anchored for
 * visual descriptors) is converted to this on fetch.
 */
interface NormalizedExample {
  id: string;
  /** Short header label shown above the body. */
  short_label: string;
  /** Main body text shown to the owner. */
  primary_text: string;
  /**
   * Reference image URLs for image-based variants (env_look, subject_style).
   * Undefined for text-only variants (mechanical_style).
   */
  reference_images?: { url: string; label: string }[];
  /**
   * Secondary line shown beneath primary_text — used by tagline rationale.
   * Quieter typographic treatment.
   */
  subtext?: string;
  /**
   * Render kind. "tagline" emphasizes primary_text typographically (the
   * short line IS the artifact, vs paragraph descriptors where primary_text
   * is a longer body).
   */
  render_kind?: "default" | "tagline";
}

interface NormalizedExampleSubstrate {
  examples: NormalizedExample[];
  meta: {
    inputs_hash: string;
    generated_at: string;
    model: string;
    prompt_version: string;
  };
}

function normalizeExampleSubstrate(raw: unknown): NormalizedExampleSubstrate | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const examples = Array.isArray(obj.examples) ? (obj.examples as unknown[]) : [];
  const meta = obj.meta as NormalizedExampleSubstrate["meta"] | undefined;
  if (!meta) return null;
  const sourceImages = Array.isArray(obj.source_images)
    ? (obj.source_images as { url: string; label: string }[])
    : [];

  const normalized: NormalizedExample[] = examples
    .map((ex): NormalizedExample | null => {
      if (!ex || typeof ex !== "object") return null;
      const e = ex as Record<string, unknown>;
      const id = typeof e.id === "string" ? e.id : null;
      if (!id) return null;

      // mechanical_style: { id, style_label, paragraph }
      if (typeof e.paragraph === "string") {
        return {
          id,
          short_label: typeof e.style_label === "string" ? e.style_label : id,
          primary_text: e.paragraph,
        };
      }

      // tagline: { id, style_label, tagline, rationale, length_words }
      if (typeof e.tagline === "string") {
        return {
          id,
          short_label: typeof e.style_label === "string" ? e.style_label : id,
          primary_text: e.tagline,
          subtext: typeof e.rationale === "string" ? e.rationale : undefined,
          render_kind: "tagline",
        };
      }

      // env_look / subject_style: { id, caption, reference_frame_indexes, disposition_summary }
      if (typeof e.caption === "string" || typeof e.disposition_summary === "string") {
        const indexes = Array.isArray(e.reference_frame_indexes)
          ? (e.reference_frame_indexes as unknown[]).filter(
              (n): n is number => typeof n === "number",
            )
          : [];
        const refs = indexes
          .map((i) => sourceImages[i])
          .filter((s): s is { url: string; label: string } => Boolean(s));
        return {
          id,
          short_label: typeof e.caption === "string" ? e.caption : id,
          primary_text:
            typeof e.disposition_summary === "string"
              ? e.disposition_summary
              : typeof e.caption === "string"
                ? e.caption
                : "",
          reference_images: refs.length > 0 ? refs : undefined,
        };
      }

      return null;
    })
    .filter((e): e is NormalizedExample => e !== null);

  return { examples: normalized, meta };
}

function ExampleSetPickerEditor({
  descriptorKey,
  siteId,
  value,
  onChange,
  onBlur,
}: {
  descriptorKey: string;
  siteId: string;
  value: unknown;
  onChange: (next: unknown) => void;
  onBlur: () => void;
}) {
  const source = EXAMPLE_SET_PICKER_SOURCES[descriptorKey];
  const [substrate, setSubstrate] = useState<NormalizedExampleSubstrate | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valueObj =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;

  const currentSelectedId =
    valueObj && typeof valueObj.selected_example_id === "string"
      ? (valueObj.selected_example_id as string)
      : null;

  /**
   * Legacy declared text — populated by migrate-tagline-decomp-picker-shape.js
   * when wrapping a pre-decomposition single-textarea string into the picker
   * shape with selected_example_id="legacy". Surfaced as a separate banner
   * above the picker so the owner sees their prior wording even before they
   * click Generate. Once they generate, the substrate normally includes a
   * "legacy" candidate card too (the generator preserves the id) — at that
   * point the banner is redundant and we hide it.
   */
  const legacyDeclaredText =
    currentSelectedId === "legacy" &&
    typeof valueObj?.selected_example_text === "string"
      ? (valueObj.selected_example_text as string).trim()
      : null;
  const substrateHasLegacyCard =
    substrate?.examples.some((ex) => ex.id === "legacy") ?? false;
  const showLegacyBanner =
    legacyDeclaredText !== null && legacyDeclaredText.length > 0 && !substrateHasLegacyCard;

  const refresh = useCallback(async () => {
    if (!source) return;
    try {
      const r = await fetch(`${source.endpoint}?siteId=${siteId}`);
      if (!r.ok) throw new Error(`API ${r.status}`);
      const json = (await r.json()) as { examples: unknown };
      setSubstrate(normalizeExampleSubstrate(json.examples));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [siteId, source]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = async () => {
    if (!source) return;
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(source.endpoint, {
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
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const pick = (ex: NormalizedExample) => {
    if (!substrate) return;
    onChange({
      selected_example_id: ex.id,
      selected_example_text: ex.primary_text,
      selected_example_label: ex.short_label,
      selected_example_reference_images: ex.reference_images ?? null,
      generated_from_inputs_hash: substrate.meta.inputs_hash,
    });
    onBlur();
  };

  if (!source) {
    return (
      <p className="text-xs text-red-600">
        example_set_picker source not configured for descriptor &quot;{descriptorKey}&quot;.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent/20 disabled:opacity-50"
            >
              {generating
                ? "Generating…"
                : substrate
                ? "Regenerate examples ⚙"
                : "Generate examples ⚙"}
            </button>
            {substrate && (
              <span className="text-[10px] text-muted">
                Generated{" "}
                {new Date(substrate.meta.generated_at).toLocaleString()}
              </span>
            )}
          </div>
          {source.inputsAreReadyLabel && !substrate && (
            <p className="text-[10px] text-muted mt-1 max-w-md leading-relaxed">
              {source.inputsAreReadyLabel}
            </p>
          )}
        </div>
        {error && <span className="text-[10px] text-red-600">{error}</span>}
      </div>

      {showLegacyBanner && (
        <div className="rounded border border-amber-300/60 bg-amber-50/40 dark:bg-amber-900/10 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-400 font-medium">
            Your previous declaration
          </p>
          <p className="mt-0.5 text-xs text-foreground italic">
            &ldquo;{legacyDeclaredText}&rdquo;
          </p>
          <p className="mt-1 text-[10px] leading-relaxed text-muted">
            This is the tagline you wrote before this descriptor was decomposed. Click
            <em> Generate examples</em> below — your prior wording will appear as one of the
            candidates, alongside the brand&rsquo;s observed surface tagline (if any) and 3
            fresh alternatives. You can keep it, swap to the observed line, or pick a fresh one.
          </p>
        </div>
      )}

      {loading && <p className="text-xs text-muted">Loading examples…</p>}

      {!loading && !substrate && (
        <p className="text-xs italic text-muted">
          No examples generated yet. Click <em>Generate examples</em> above to scaffold the
          picker with 3 industry-specific candidates.
        </p>
      )}

      {substrate && (
        <div className="space-y-2">
          {substrate.examples.map((ex) => {
            const selected = ex.id === currentSelectedId;
            const hasImages = ex.reference_images && ex.reference_images.length > 0;
            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => pick(ex)}
                className={`w-full text-left rounded border p-3 transition-colors ${
                  selected
                    ? "border-accent/60 bg-accent/10"
                    : "border-border bg-card hover:bg-muted/20"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted">
                    {ex.short_label}
                  </span>
                  {selected && (
                    <span className="text-[10px] font-medium text-foreground">✓ Selected</span>
                  )}
                </div>
                {hasImages && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {ex.reference_images!.map((img, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={`${img.url}-${i}`}
                        src={cdnImage(img.url, { width: 120, height: 90 })}
                        alt={img.label}
                        title={img.label}
                        className="h-14 w-auto rounded border border-border object-cover"
                      />
                    ))}
                  </div>
                )}
                {ex.render_kind === "tagline" ? (
                  <p className="text-base font-semibold leading-snug text-foreground">
                    &ldquo;{ex.primary_text}&rdquo;
                  </p>
                ) : (
                  <p className="text-xs leading-relaxed text-foreground">{ex.primary_text}</p>
                )}
                {ex.subtext && (
                  <p className="mt-1.5 text-[11px] italic leading-relaxed text-muted">
                    {ex.subtext}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Per-descriptor map of (substrate API endpoint, label). Adding a new
 * synthesis_review descriptor (tone.effect, voice_source.character) means
 * adding an entry here.
 */
const SYNTHESIS_REVIEW_SOURCES: Record<
  string,
  { endpoint: string; subjectLabel: string; inputsAreReadyLabel?: string }
> = {
  "tone.effect": {
    endpoint: "/api/ops/brand-identity/tone-effect-recommendation",
    subjectLabel: "audience effect",
    inputsAreReadyLabel:
      "Synthesis uses tone.attributes + tone.example + voice_source + audience profile + positioning. Confidence scales with how complete those upstream inputs are — fill them in for sharper suggestions.",
  },
  "voice_source.character": {
    endpoint: "/api/ops/brand-identity/voice-source-character-recommendation",
    subjectLabel: "character",
    inputsAreReadyLabel:
      "Synthesis uses voice_source.source + tone.attributes + tone.example + audience profile. Confidence scales with how complete those upstream inputs are — fill them in for sharper suggestions.",
  },
};

interface SynthesisSuggestion {
  id: string;
  prose: string;
  reasoning: string;
  confidence: number;
}

interface SynthesisSubstrate {
  suggestions: SynthesisSuggestion[];
  meta: {
    inputs_hash: string;
    generated_at: string;
    model: string;
    prompt_version: string;
  };
}

interface SynthesisDeclaredShape {
  text?: string;
  source_suggestion_id?: string | null;
  reasoning?: string | null;
  generated_from_inputs_hash?: string | null;
}

function confidenceLabel(c: number): { label: string; classes: string } {
  if (c >= 0.8) return { label: "high confidence", classes: "text-emerald-700 dark:text-emerald-400" };
  if (c >= 0.6) return { label: "medium confidence", classes: "text-foreground" };
  return { label: "low confidence — check inputs", classes: "text-amber-700 dark:text-amber-400" };
}

/**
 * synthesis_review editor: shared primitive for tone.effect + voice_source.character.
 *
 * Three states:
 *   1. No substrate     → "Generate suggestions" button
 *   2. Substrate, no    → render 3 cards; clicking "Use this" loads the prose
 *      accepted text       into the editable textarea below
 *   3. Accepted text    → textarea shows current declared; cards stay rendered
 *                          with the source one marked ✓; owner can edit + Save
 *                          or click a different card to swap
 *
 * Stored shape (in `value`):
 *   { text, source_suggestion_id, reasoning, generated_from_inputs_hash }
 *
 * Per the locked discipline: the model PROPOSES; the owner APPROVES (or edits).
 * The textarea ensures the final prose is owner-authored even when seeded by
 * the model.
 */
function SynthesisReviewEditor({
  descriptorInputPath,
  siteId,
  value,
  onChange,
  onBlur,
}: {
  descriptorInputPath: string;
  siteId: string;
  value: unknown;
  onChange: (next: unknown) => void;
  onBlur: () => void;
}) {
  const source = SYNTHESIS_REVIEW_SOURCES[descriptorInputPath];
  const [substrate, setSubstrate] = useState<SynthesisSubstrate | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const declared: SynthesisDeclaredShape =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as SynthesisDeclaredShape)
      : {};
  const acceptedText = typeof declared.text === "string" ? declared.text : "";
  const acceptedSuggestionId =
    typeof declared.source_suggestion_id === "string"
      ? declared.source_suggestion_id
      : null;

  // Local draft so we don't onChange/onBlur the parent on every keystroke.
  const [draft, setDraft] = useState<string>(acceptedText);
  const [dirty, setDirty] = useState(false);

  // Re-sync local draft when value changes from outside (e.g., picked a new card).
  useEffect(() => {
    setDraft(acceptedText);
    setDirty(false);
  }, [acceptedText]);

  const refresh = useCallback(async () => {
    if (!source) return;
    try {
      const r = await fetch(`${source.endpoint}?siteId=${siteId}`);
      if (!r.ok) throw new Error(`API ${r.status}`);
      const json = (await r.json()) as { suggestions: SynthesisSubstrate | null };
      setSubstrate(json.suggestions ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [siteId, source]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = async () => {
    if (!source) return;
    setGenerating(true);
    setError(null);
    try {
      const r = await fetch(source.endpoint, {
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
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const useSuggestion = (s: SynthesisSuggestion) => {
    if (!substrate) return;
    const next: SynthesisDeclaredShape = {
      text: s.prose,
      source_suggestion_id: s.id,
      reasoning: s.reasoning,
      generated_from_inputs_hash: substrate.meta.inputs_hash,
    };
    onChange(next);
    onBlur();
  };

  const saveDraft = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      // Clear declared if owner emptied the textarea.
      onChange(null);
      onBlur();
      return;
    }
    const next: SynthesisDeclaredShape = {
      ...declared,
      text: trimmed,
    };
    onChange(next);
    onBlur();
    setDirty(false);
  };

  if (!source) {
    return (
      <p className="text-xs text-red-600">
        synthesis_review source not configured for &quot;{descriptorInputPath}&quot;.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[11px] font-medium text-foreground hover:bg-accent/20 disabled:opacity-50"
            >
              {generating
                ? "Generating…"
                : substrate
                ? "Regenerate suggestions ⚙"
                : "Generate suggestions ⚙"}
            </button>
            {substrate && (
              <span className="text-[10px] text-muted">
                Generated{" "}
                {new Date(substrate.meta.generated_at).toLocaleString()}
              </span>
            )}
          </div>
          {source.inputsAreReadyLabel && !substrate && (
            <p className="text-[10px] text-muted mt-1 max-w-md leading-relaxed">
              {source.inputsAreReadyLabel}
            </p>
          )}
        </div>
        {error && <span className="text-[10px] text-red-600">{error}</span>}
      </div>

      {loading && <p className="text-xs text-muted">Loading suggestions…</p>}

      {!loading && !substrate && !acceptedText && (
        <p className="text-xs italic text-muted">
          No suggestions generated yet. Click <em>Generate suggestions</em> above to scaffold
          3 candidate &quot;{source.subjectLabel}&quot; statements.
        </p>
      )}

      {substrate && (
        <div className="space-y-2">
          {substrate.suggestions.map((s) => {
            const isSource = s.id === acceptedSuggestionId;
            const conf = confidenceLabel(s.confidence);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => useSuggestion(s)}
                className={`w-full text-left rounded border p-3 transition-colors ${
                  isSource
                    ? "border-accent/60 bg-accent/10"
                    : "border-border bg-card hover:bg-muted/20"
                }`}
              >
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <span className="text-[10px] uppercase tracking-wide text-muted">
                    {s.id.replace("suggestion_", "Option ").toUpperCase()}
                    <span className={`ml-2 normal-case ${conf.classes}`}>
                      {conf.label} ({(s.confidence * 100).toFixed(0)}%)
                    </span>
                  </span>
                  {isSource && (
                    <span className="text-[10px] font-medium text-foreground">✓ Used</span>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-foreground">{s.prose}</p>
                <p className="mt-1.5 text-[11px] italic leading-relaxed text-muted">
                  Why: {s.reasoning}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {(substrate || acceptedText) && (
        <div className="rounded border border-border bg-muted/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-wide text-muted font-medium">
              Current {source.subjectLabel} {dirty && <span className="text-amber-700 dark:text-amber-400">— unsaved edits</span>}
            </p>
            <button
              type="button"
              onClick={saveDraft}
              disabled={!dirty}
              className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-medium text-foreground hover:bg-accent/20 disabled:opacity-50 disabled:hover:bg-accent/10"
            >
              Save edits
            </button>
          </div>
          <textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(e.target.value.trim() !== acceptedText.trim());
            }}
            placeholder={
              acceptedText
                ? ""
                : `Click a suggestion above to load it here, or type the ${source.subjectLabel} from scratch.`
            }
            rows={4}
            className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs leading-relaxed focus:border-accent focus:outline-none"
          />
        </div>
      )}
    </div>
  );
}

function SinglePickerEditor({
  input,
  value,
  onChange,
  onBlur,
}: {
  input: DescriptorInput;
  value: unknown;
  onChange: (next: unknown) => void;
  onBlur: () => void;
}) {
  const options = input.options ?? [];
  const current = typeof value === "string" ? value : "";
  const isUniversal = options.includes(current);
  const customDraft = !isUniversal && current.length > 0 ? current : "";
  const [draft, setDraft] = useState(customDraft);

  const pick = (opt: string) => {
    onChange(opt);
    onBlur();
  };

  const commitCustom = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0) {
      if (!isUniversal) onChange("");
      onBlur();
      return;
    }
    onChange(trimmed);
    onBlur();
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const selected = opt === current;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => pick(opt)}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                selected
                  ? "border-accent/60 bg-accent/20 text-foreground"
                  : "border-border bg-muted/20 text-muted hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {input.allowCustom && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted">Other:</span>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitCustom}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitCustom();
              }
            }}
            placeholder="Custom value"
            className={`flex-1 max-w-xs rounded border bg-background px-2 py-1 text-xs focus:outline-none ${
              !isUniversal && current.length > 0
                ? "border-accent/60"
                : "border-border focus:border-accent"
            }`}
          />
        </div>
      )}
    </div>
  );
}

function MultiPickerEditor({
  input,
  value,
  onChange,
  onBlur,
}: {
  input: DescriptorInput;
  value: unknown;
  onChange: (next: unknown) => void;
  onBlur: () => void;
}) {
  const options = input.options ?? [];
  const selected: string[] = Array.isArray(value)
    ? (value as unknown[]).filter((v): v is string => typeof v === "string")
    : [];
  const max = input.maxSelections;
  const atCap = typeof max === "number" && selected.length >= max;
  const [customDraft, setCustomDraft] = useState("");

  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      const next = selected.filter((s) => s !== opt);
      onChange(next);
    } else {
      if (atCap) return;
      onChange([...selected, opt]);
    }
    onBlur();
  };

  const addCustom = () => {
    const trimmed = customDraft.trim();
    if (trimmed.length === 0) return;
    if (selected.includes(trimmed)) {
      setCustomDraft("");
      return;
    }
    if (atCap) return;
    onChange([...selected, trimmed]);
    setCustomDraft("");
    onBlur();
  };

  const removeCustom = (val: string) => {
    onChange(selected.filter((s) => s !== val));
    onBlur();
  };

  const customSelected = selected.filter((s) => !options.includes(s));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>
          {input.qualifier ? `Pick ${input.qualifier}` : "Pick"}
          {typeof max === "number" && ` — up to ${max}`}
        </span>
        <span>
          {selected.length}
          {typeof max === "number" && ` / ${max}`} picked
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const isSelected = selected.includes(opt);
          const disabled = !isSelected && atCap;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              disabled={disabled}
              className={`rounded-full border px-3 py-1 text-[11px] font-medium transition-colors ${
                isSelected
                  ? "border-accent/60 bg-accent/20 text-foreground"
                  : "border-border bg-muted/20 text-muted hover:bg-muted/40 hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-muted/20"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {input.allowCustom && (
        <div className="space-y-1.5">
          {customSelected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customSelected.map((opt) => (
                <span
                  key={opt}
                  className="inline-flex items-center gap-1 rounded-full border border-accent/60 bg-accent/20 px-2.5 py-0.5 text-[11px] font-medium text-foreground"
                >
                  {opt}
                  <button
                    type="button"
                    onClick={() => removeCustom(opt)}
                    className="text-muted hover:text-foreground"
                    aria-label={`Remove ${opt}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted">Add:</span>
            <input
              type="text"
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
              disabled={atCap}
              placeholder={atCap ? "Cap reached" : "Custom value"}
              className="flex-1 max-w-xs rounded border border-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none disabled:opacity-40"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={atCap || customDraft.trim().length === 0}
              className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-medium text-foreground hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function AngleCollectionEditor({
  input,
  value,
  onChange,
  onBlur,
  gbpCategories,
}: {
  input: DescriptorInput;
  value: unknown;
  onChange: (next: unknown) => void;
  onBlur: () => void;
  gbpCategories?: { gcid: string; name: string; isPrimary: boolean }[];
}) {
  const schema = input.angleSchema ?? [];
  const defaultCount = input.defaultAngleCount ?? 3;

  // Read angles array from current value; ensure default count of placeholders.
  const angles: Array<Record<string, unknown>> = (() => {
    const v = value as { angles?: unknown[] } | null;
    const stored = Array.isArray(v?.angles) ? (v!.angles as unknown[]) : [];
    const normalized = stored.map((a) =>
      a && typeof a === "object" && !Array.isArray(a)
        ? (a as Record<string, unknown>)
        : {},
    );
    while (normalized.length < defaultCount) normalized.push({});
    return normalized;
  })();

  const updateAngle = (idx: number, updater: (angle: Record<string, unknown>) => Record<string, unknown>) => {
    const next = [...angles];
    next[idx] = updater(next[idx] ?? {});
    onChange({ angles: next });
  };

  const setField = (
    idx: number,
    sectionKey: string,
    fieldKey: string,
    fieldValue: string | string[],
  ) => {
    updateAngle(idx, (angle) => {
      const sec = (angle[sectionKey] && typeof angle[sectionKey] === "object" && !Array.isArray(angle[sectionKey])
        ? (angle[sectionKey] as Record<string, unknown>)
        : {});
      return {
        ...angle,
        [sectionKey]: { ...sec, [fieldKey]: fieldValue },
      };
    });
  };

  const addAngle = () => {
    onChange({ angles: [...angles, {}] });
  };

  const clearAngle = (idx: number) => {
    if (!window.confirm(`Clear angle ${idx + 1}? All fields for this angle will be reset.`))
      return;
    const next = [...angles];
    next[idx] = {};
    onChange({ angles: next });
    onBlur();
  };

  const removeAngle = (idx: number) => {
    if (!window.confirm(`Remove angle ${idx + 1}? This deletes the angle entirely.`))
      return;
    const next = angles.filter((_, i) => i !== idx);
    onChange({ angles: next });
    onBlur();
  };

  const readField = (
    angle: Record<string, unknown>,
    sectionKey: string,
    fieldKey: string,
  ): string | string[] | undefined => {
    const sec = angle[sectionKey];
    if (!sec || typeof sec !== "object" || Array.isArray(sec)) return undefined;
    const fv = (sec as Record<string, unknown>)[fieldKey];
    if (typeof fv === "string") return fv;
    if (Array.isArray(fv) && fv.every((s) => typeof s === "string"))
      return fv as string[];
    return undefined;
  };

  return (
    <div className="space-y-3">
      {angles.map((angle, idx) => {
        const name = readField(angle, "identity", "name");
        const displayName = typeof name === "string" && name.trim().length > 0 ? name : `Angle ${idx + 1}`;
        return (
          <div
            key={idx}
            className="rounded-lg border border-border/60 bg-surface p-2 space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-foreground">
                {displayName}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={() => clearAngle(idx)}
                  className="rounded border border-border text-muted px-1.5 py-0.5 text-[10px] font-medium hover:bg-surface-hover"
                  title="Clear this angle's fields"
                >
                  Clear
                </button>
                {angles.length > 1 && (
                  <button
                    onClick={() => removeAngle(idx)}
                    className="rounded border border-border text-muted px-1.5 py-0.5 text-[10px] font-medium hover:bg-danger/10 hover:text-danger"
                    title="Remove this angle entirely"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            {schema.map((section) => (
              <div key={section.key} className="space-y-1 pl-2 border-l border-border/40">
                <div>
                  <p className="text-[10px] font-medium text-foreground">{section.label}</p>
                  {section.description && (
                    <p className="text-[9px] text-muted">{section.description}</p>
                  )}
                </div>
                {section.fields.map((field) => {
                  const fv = readField(angle, section.key, field.key);
                  const stringVal = typeof fv === "string" ? fv : "";
                  const arrayVal = Array.isArray(fv) ? fv : [];
                  return (
                    <div key={field.key} className="space-y-0.5">
                      {field.label && (
                        <label className="text-[10px] font-medium text-foreground">
                          {field.label}
                          {field.required && (
                            <span className="ml-1 text-[9px] text-warning">required</span>
                          )}
                          {field.prompt && (
                            <span className="ml-1 text-[9px] text-muted font-normal">
                              — {field.prompt}
                            </span>
                          )}
                        </label>
                      )}
                      {!field.label && field.prompt && (
                        <label className="text-[10px] text-muted">{field.prompt}</label>
                      )}
                      {field.kind === "text" && (
                        <input
                          type="text"
                          value={stringVal}
                          onChange={(e) => setField(idx, section.key, field.key, e.target.value)}
                          onBlur={onBlur}
                          placeholder={field.placeholder}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                        />
                      )}
                      {field.kind === "textarea" && (
                        <textarea
                          value={stringVal}
                          onChange={(e) => setField(idx, section.key, field.key, e.target.value)}
                          onBlur={onBlur}
                          rows={field.rows ?? 2}
                          placeholder={field.placeholder}
                          className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none resize-y"
                        />
                      )}
                      {field.kind === "multi_picker" && (
                        <MultiPickerField
                          options={field.options ?? []}
                          value={arrayVal}
                          onChange={(next) =>
                            setField(idx, section.key, field.key, next)
                          }
                          onBlur={onBlur}
                        />
                      )}
                      {field.kind === "gbp_categories_picker" && (
                        <div className="space-y-0.5">
                          {!gbpCategories || gbpCategories.length === 0 ? (
                            <p className="text-[10px] text-muted">
                              No GBP categories yet. Set up categories via CMA + coaching first.
                            </p>
                          ) : (
                            gbpCategories.map((cat) => {
                              const checked = arrayVal.includes(cat.gcid);
                              return (
                                <label
                                  key={cat.gcid}
                                  className="flex items-start gap-2 text-[10px] cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => {
                                      const next = e.target.checked
                                        ? [...arrayVal, cat.gcid]
                                        : arrayVal.filter((v) => v !== cat.gcid);
                                      setField(idx, section.key, field.key, next);
                                    }}
                                    onBlur={onBlur}
                                    className="mt-0.5"
                                  />
                                  <span>
                                    {cat.name}
                                    {cat.isPrimary && (
                                      <span className="ml-1 text-accent">(primary)</span>
                                    )}
                                  </span>
                                </label>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
      <button
        onClick={addAngle}
        className="rounded border border-dashed border-border px-3 py-1 text-[10px] font-medium text-muted hover:bg-surface-hover"
      >
        + Add another angle
      </button>
    </div>
  );
}

function DescriptorCard({
  d,
  siteId,
  draft,
  isSaving,
  isDirty,
  required,
  pickerOpen,
  assets,
  dictationSupported,
  dictationActive,
  dictationState,
  dictationElapsedMs,
  onDictate,
  onChange,
  onBlur,
  onOpenPicker,
  onToggleAsset,
  onToggleBaseline,
  forbiddenTerms,
  validatingScopeId,
  onValidate,
  onStabilityTest,
  onReset,
  onOpenFindings,
  gbpCategories,
}: {
  d: DescriptorRecord;
  siteId: string;
  draft: unknown; // string for single-textarea descriptors, object for decomposed
  isSaving: boolean;
  isDirty: boolean;
  required: boolean;
  pickerOpen: boolean;
  assets: PickerAsset[] | null;
  dictationSupported: boolean;
  dictationActive: boolean;
  dictationState: DictationState;
  dictationElapsedMs: number;
  onDictate: () => void;
  onChange: (v: unknown) => void; // full updated draft (string OR object)
  onBlur: () => void;
  onOpenPicker: () => void;
  onToggleAsset: (assetId: string, bound: boolean) => void;
  onToggleBaseline: (baselineId: string, optingOut: boolean) => void;
  forbiddenTerms: ForbiddenTerm[];
  /** Scope id currently validating on THIS descriptor (e.g. "lists" or "prose:example"), else null. */
  validatingScopeId: string | null;
  /**
   * Trigger validation. `scope` undefined → all groups (used for non-decomposed
   * descriptors that have one synthetic prose:text group). Otherwise scope is
   * the per-group call: "lists" or { prose: <inputKey> }.
   */
  onValidate: (scope?: "lists" | { prose: string }) => void;
  /** Per-scope stability test. `scope` undefined → whole descriptor. */
  onStabilityTest: (scope?: "lists" | { prose: string }) => void;
  /** Per-scope reset (destructive — clears canonical, substrate, findings, declared). */
  onReset: (scope?: "lists" | { prose: string }) => void;
  /** Open the findings modal for a scope (scope-aware: only that scope's findings show). */
  onOpenFindings: (scope?: "lists" | { prose: string }) => void;
  /**
   * Read-only GBP categories — surfaced under the offer descriptor's
   * "Services (from GBP)" section in lieu of an owner-declared services
   * sub-input. Per the offer.services-reconciliation lock. Only passed
   * when the descriptor key is "offer"; undefined otherwise.
   */
  gbpCategories?: { gcid: string; name: string; isPrimary: boolean }[];
}) {
  const [showInspect, setShowInspect] = useState(false);
  const boundIds = new Set(d.assets.map((a) => a.assetId));
  const done = isSatisfied(d);
  const recording = dictationActive && dictationState === "recording";
  const transcribing = dictationActive && dictationState === "transcribing";

  return (
    <div className="rounded-xl border border-border/60 bg-surface p-3 shadow-card space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold">{d.label ?? d.key}</span>
        {required && (
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
              done ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
            }`}
          >
            required
          </span>
        )}
        {isGuardrail(d) && (
          <span className="rounded bg-muted/20 text-muted px-1.5 py-0.5 text-[9px] font-medium">
            guardrail
          </span>
        )}
        {d.status && STATUS_BADGE[d.status] && (
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${STATUS_BADGE[d.status]}`}
          >
            {d.status === "extracting" ? "extracting…" : d.status}
          </span>
        )}
        {isSaving && <span className="text-[9px] text-muted">saving…</span>}
        {!isSaving && isDirty && <span className="text-[9px] text-warning">unsaved</span>}

        <div className="ml-auto flex items-center gap-1">
          {isTextCapable(d) && !d.spec?.inputs && dictationSupported && (
            <button
              onClick={onDictate}
              disabled={transcribing}
              className={`rounded px-2 py-0.5 text-[10px] font-medium disabled:opacity-50 ${
                recording
                  ? "bg-danger/10 text-danger"
                  : "border border-border text-muted hover:bg-surface-hover"
              }`}
              title="Dictate — record and transcribe into this field"
            >
              {recording
                ? `● Stop ${fmtElapsed(dictationElapsedMs)}`
                : transcribing
                  ? "Transcribing…"
                  : "🎙 Dictate"}
            </button>
          )}
          {/* Non-decomposed: state + Validate + ×5 inline in the header. */}
          {draftToText(d.declared).trim().length > 0 && !d.spec?.inputs && (() => {
            const groups = computeGroups(d, validatingScopeId);
            if (groups.length === 0) return null;
            const g = groups[0];
            return renderGroupControl(
              g,
              validatingScopeId !== null,
              onValidate,
              onStabilityTest,
              onReset,
              onOpenFindings,
            );
          })()}
        </div>
      </div>
      <p className="text-[10px] text-muted">{d.spec?.describes}</p>

      {(() => {
        const applicable = baselinesFor(d.key);
        if (applicable.length === 0) return null;
        // null/missing = all applicable apply (default-on for fresh descriptors)
        const applied =
          d.metadata?.baselinesApplied ?? applicable.map((b) => b.id);
        return (
          <div className="space-y-1">
            <p className="text-[10px] uppercase tracking-wide text-muted">
              Common sets — uncheck what doesn&apos;t apply
            </p>
            {applicable.map((b) => {
              const isApplied = applied.includes(b.id);
              return (
                <label
                  key={b.id}
                  className="flex items-start gap-2 text-[10px] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={isApplied}
                    onChange={() => onToggleBaseline(b.id, !isApplied)}
                    className="mt-0.5"
                  />
                  <span className="flex-1">
                    <span className="font-medium text-foreground">{b.label}</span>
                    <div className="text-muted">Avoid: {b.terms.join(", ")}</div>
                    {b.allowed && b.allowed.length > 0 && (
                      <div className="text-muted">
                        Use instead: {b.allowed.join(", ")}
                      </div>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        );
      })()}

      {/* Services (from GBP) — read-only canonical section for the offer descriptor.
          Populated upstream by CMA + categories coaching; brand identity is consumer-only. */}
      {gbpCategories && (
        <div className="rounded-lg border border-border bg-background p-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Services (from GBP)
            </span>
            <span className="rounded bg-muted/10 text-muted px-2 py-0.5 text-[10px] font-medium">
              Canonical · read-only
            </span>
          </div>
          {gbpCategories.length === 0 ? (
            <p className="text-[10px] text-muted">
              No GBP categories yet — populated by competitive market analysis + categories
              coaching during onboarding. Once the CMA runs, the curated 10-best
              categories will appear here.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {gbpCategories.map((c) => (
                <li
                  key={c.gcid}
                  className="flex items-center gap-2 text-xs text-foreground"
                >
                  <span>{c.name}</span>
                  {c.isPrimary && (
                    <span className="rounded bg-accent/10 text-accent px-1.5 py-0.5 text-[9px] font-medium">
                      primary
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isTextCapable(d) && d.spec?.inputs && (() => {
        // Decomposed sub-fields wrapped per validation group. Each group renders
        // as a sub-card with its own title + per-group validate control + the
        // member inputs. Per [[descriptor-design-protocol]] this makes
        // validation boundaries visible to the owner.
        const inputsByKey: Record<string, NonNullable<typeof d.spec.inputs>[number]> = {};
        for (const input of d.spec.inputs ?? []) inputsByKey[input.key] = input;
        const groups = computeGroups(d, validatingScopeId);
        const obj =
          draft && typeof draft === "object"
            ? (draft as Record<string, unknown>)
            : ({} as Record<string, unknown>);
        const anyValidating = validatingScopeId !== null;
        return (
          <div className="space-y-3">
            {groups.map((g) => {
              const memberInputs = g.members
                .map((k) => inputsByKey[k])
                .filter((i): i is NonNullable<typeof i> => Boolean(i));
              return (
                <div
                  key={g.id}
                  className="rounded-lg border border-border bg-background p-2 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                      {g.label}
                    </span>
                    {g.validatable && (
                      <div className="ml-auto flex items-center gap-1.5">
                        {renderGroupControl(g, anyValidating, onValidate, onStabilityTest, onReset, onOpenFindings)}
                      </div>
                    )}
                  </div>
                  {memberInputs.map((input) => {
                    const value = obj[input.key];
                    const baseSlots = input.slotCount ?? 5;
                    const listValue = Array.isArray(value) ? (value as unknown[]) : [];
                    const slotCount = Math.max(baseSlots, listValue.length);
                    return (
                      <div key={input.key} className="space-y-1">
                        <label className="text-[10px] font-medium text-foreground">
                          {input.prompt}
                          {input.required && (
                            <span className="ml-1 text-[9px] text-warning">required</span>
                          )}
                        </label>
                        {input.inputType === "list" ? (
                          <div className="space-y-1">
                            {Array.from({ length: slotCount }).map((_, i) => {
                              const list = Array.isArray(value) ? (value as string[]) : [];
                              const slotValue = typeof list[i] === "string" ? list[i] : "";
                              return (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 text-xs"
                                >
                                  <span className="text-[10px] text-muted w-4 text-right">
                                    {i + 1}.
                                  </span>
                                  <input
                                    type="text"
                                    value={slotValue}
                                    onChange={(e) => {
                                      const next = [...list];
                                      while (next.length < slotCount) next.push("");
                                      next[i] = e.target.value;
                                      onChange({ ...obj, [input.key]: next });
                                    }}
                                    onBlur={onBlur}
                                    className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        ) : input.inputType === "angle_collection" ? (
                          <AngleCollectionEditor
                            input={input}
                            value={value}
                            onChange={(next) => onChange({ ...obj, [input.key]: next })}
                            onBlur={onBlur}
                            gbpCategories={gbpCategories}
                          />
                        ) : input.inputType === "slot_composition" ? (
                          <div className="space-y-2 pl-2 border-l-2 border-border/60">
                            {(input.slots ?? []).map((slot) => {
                              const slotObj =
                                value && typeof value === "object" && !Array.isArray(value)
                                  ? (value as Record<string, unknown>)
                                  : {};
                              const slotValue =
                                typeof slotObj[slot.key] === "string"
                                  ? (slotObj[slot.key] as string)
                                  : "";
                              const setSlot = (next: string) => {
                                onChange({
                                  ...obj,
                                  [input.key]: { ...slotObj, [slot.key]: next },
                                });
                              };
                              return (
                                <div key={slot.key} className="space-y-0.5">
                                  <label className="text-[10px] font-medium text-foreground">
                                    {slot.label}
                                    {slot.required && (
                                      <span className="ml-1 text-[9px] text-warning">required</span>
                                    )}
                                    <span className="ml-1 text-[9px] text-muted font-normal">
                                      — {slot.prompt}
                                    </span>
                                  </label>
                                  {slot.kind === "picker" ? (
                                    <select
                                      value={slotValue}
                                      onChange={(e) => setSlot(e.target.value)}
                                      onBlur={onBlur}
                                      className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                                    >
                                      <option value="">— pick one —</option>
                                      {(slot.options ?? []).map((opt) => (
                                        <option key={opt} value={opt}>
                                          {opt}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={slotValue}
                                      onChange={(e) => setSlot(e.target.value)}
                                      onBlur={onBlur}
                                      placeholder={slot.placeholder}
                                      className="w-full rounded border border-border bg-background px-2 py-1 text-xs focus:border-accent focus:outline-none"
                                    />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : input.inputType === "single_picker" ? (
                          <SinglePickerEditor
                            input={input}
                            value={value}
                            onChange={(next) => onChange({ ...obj, [input.key]: next })}
                            onBlur={onBlur}
                          />
                        ) : input.inputType === "multi_picker" ? (
                          <MultiPickerEditor
                            input={input}
                            value={value}
                            onChange={(next) => onChange({ ...obj, [input.key]: next })}
                            onBlur={onBlur}
                          />
                        ) : input.inputType === "example_set_picker" ? (
                          <ExampleSetPickerEditor
                            descriptorKey={d.key}
                            siteId={siteId}
                            value={value}
                            onChange={(next) => onChange({ ...obj, [input.key]: next })}
                            onBlur={onBlur}
                          />
                        ) : input.inputType === "scaffolded_picker_matrix" ? (
                          <ScaffoldedPickerMatrixEditor
                            descriptorKey={d.key}
                            siteId={siteId}
                            value={value}
                            onChange={(next) => onChange({ ...obj, [input.key]: next })}
                            onBlur={onBlur}
                          />
                        ) : input.inputType === "bool_toggle_overrides" ? (
                          <BoolToggleOverridesEditor
                            descriptorKey={d.key}
                            value={value}
                            onChange={(next) => onChange({ ...obj, [input.key]: next })}
                            onBlur={onBlur}
                          />
                        ) : input.inputType === "synthesis_review" ? (
                          <SynthesisReviewEditor
                            descriptorInputPath={`${d.key}.${input.key}`}
                            siteId={siteId}
                            value={value}
                            onChange={(next) => onChange({ ...obj, [input.key]: next })}
                            onBlur={onBlur}
                          />
                        ) : (
                          <textarea
                            value={typeof value === "string" ? value : ""}
                            onChange={(e) =>
                              onChange({ ...obj, [input.key]: e.target.value })
                            }
                            onBlur={onBlur}
                            rows={input.rows ?? 3}
                            placeholder="In the owner's own words — raw is fine."
                            className="w-full text-xs rounded border border-border bg-background px-3 py-2 focus:border-accent focus:outline-none resize-y"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}

      {isTextCapable(d) && !d.spec?.inputs && (
        <>
          <textarea
            value={typeof draft === "string" ? draft : ""}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            rows={3}
            placeholder="Declare in the owner's own words — type or dictate; raw is fine."
            className="w-full text-xs rounded border border-border bg-background px-3 py-2 focus:border-accent focus:outline-none resize-y"
          />
          {(() => {
            const f = findingFor(d, "text");
            return f ? <ValidationWarning finding={f} /> : null;
          })()}
        </>
      )}

      {isTextCapable(d) && d.key !== "avoid" && forbiddenTerms.length > 0 && (() => {
        // Scans ALL text in the draft (string or decomposed object's text content).
        const detected = detectForbidden(draftToText(draft), forbiddenTerms);
        if (detected.length === 0) return null;
        return (
          <div className="space-y-0.5 rounded border border-warning/40 bg-warning/5 p-1.5">
            {detected.map((f) => (
              <p key={f.term} className="text-[9px] text-warning">
                ⚠ <strong>{f.term}</strong> is on your {f.baselineLabel} baseline.
                {f.allowed.length > 0 && <> Try: {f.allowed.join(", ")}.</>}
              </p>
            ))}
          </div>
        );
      })()}

      {isAssetCapable(d) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {d.assets.map((a) => {
              const meta = assets?.find((x) => x.id === a.assetId);
              return meta ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={a.assetId}
                  src={cdnImage(meta.storage_url, { width: 96, height: 96 })}
                  alt=""
                  className="h-12 w-12 rounded object-cover border border-border"
                />
              ) : (
                <span
                  key={a.assetId}
                  className="h-12 w-12 rounded border border-border bg-surface-hover flex items-center justify-center text-[9px] text-muted"
                >
                  asset
                </span>
              );
            })}
            <button
              onClick={onOpenPicker}
              className="h-12 rounded border border-dashed border-border px-3 text-[10px] font-medium text-muted hover:bg-surface-hover"
            >
              {pickerOpen ? "Close" : d.assets.length ? "Edit assets" : "Add assets"}
            </button>
          </div>

          {pickerOpen && (
            <div className="rounded border border-border bg-background p-2 max-h-48 overflow-y-auto">
              {assets === null ? (
                <p className="text-[10px] text-muted">Loading assets…</p>
              ) : assets.length === 0 ? (
                <p className="text-[10px] text-muted">No assets for this business yet.</p>
              ) : (
                <div className="grid grid-cols-5 gap-1.5">
                  {assets.map((a) => {
                    const bound = boundIds.has(a.id);
                    return (
                      <button
                        key={a.id}
                        onClick={() => onToggleAsset(a.id, bound)}
                        title={a.context_note ?? a.media_type}
                        className={`relative rounded overflow-hidden border ${
                          bound ? "border-accent ring-1 ring-accent" : "border-border"
                        }`}
                      >
                        {a.media_type.startsWith("image") ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={cdnImage(a.storage_url, { width: 160, height: 96 })}
                            alt=""
                            loading="lazy"
                            className="h-12 w-full object-cover"
                          />
                        ) : (
                          <span className="h-12 w-full flex items-center justify-center text-[9px] text-muted bg-surface-hover">
                            {a.media_type.split("/")[0]}
                          </span>
                        )}
                        {bound && (
                          <span className="absolute top-0.5 right-0.5 rounded-full bg-accent text-white text-[8px] px-1">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(d.extracted || d.status === "failed") && (
        <div className="rounded border border-border bg-background p-2 space-y-1">
          {d.extracted?.summary && (
            <p className="text-[10px] text-foreground">{d.extracted.summary}</p>
          )}
          <button
            onClick={() => setShowInspect((v) => !v)}
            className="text-[9px] text-accent hover:underline"
          >
            {showInspect ? "hide" : "inspect"} extraction
          </button>
          {showInspect && (
            <pre className="text-[9px] text-muted overflow-x-auto whitespace-pre-wrap max-h-48">
              {JSON.stringify(
                {
                  value: d.extracted?.value,
                  model: d.extractionModel,
                  inputs: d.extractedInputs,
                },
                null,
                2,
              )}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function ManageBrandIdentityPage() {
  return (
    <ManagePage title="Brand Identity" requireSite>
      {({ siteId }) => <BrandIdentityContent siteId={siteId} />}
    </ManagePage>
  );
}
