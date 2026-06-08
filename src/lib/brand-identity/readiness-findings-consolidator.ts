/**
 * Readiness findings consolidator — transforms the public_presence_observation
 * substrate into a ReadinessFinding[] suitable for the assessment-as-conversation
 * surface. Tier 3 v1 of the Phase 3 review surface.
 *
 * Architecture (per [[observation-driven-readiness-audit]] LOCKED 2026-06-04):
 *  1. Algorithmic extraction — walk the observation payload, derive candidate
 *     findings from gaps_and_absences, distinctive_elements, and per-descriptor
 *     observations. Mechanical, deterministic.
 *  2. Algorithmic classification — assign attribution + severity per finding
 *     using locked heuristics (gaps_and_absences → brand_gap; distinctives →
 *     external+informational; per-descriptor → external+refinement default).
 *     TracPost-generated attribution deferred (needs an is_tracpost_hosted
 *     flag on businesses; v1 defaults to external).
 *  3. LLM voice-templated prompt_text generation — single batch call. The LLM
 *     receives the candidate findings + their attributions and returns the
 *     owner-facing "explain this" wording per finding, using the voice template
 *     for that attribution class.
 *  4. Persist as substrate kind readiness_findings.
 *
 * CMA integration deferred — public-presence-only v1. The intake bundle
 * architecture lands when CMA finding extraction is wired alongside.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { v5 as uuidv5 } from "uuid";
import { sql } from "@/lib/db";
import { getSubstrate, upsertSubstrate } from "@/lib/substrate/store";

/**
 * Deterministic finding UUID — same descriptor_key + observation content
 * produces the same UUID for a given brand. Enables stable identity across
 * regenerations per [[ppa-cma-recurring-quality-gate]] step 2.
 *
 * Namespace: the brand's UUID (each brand gets its own namespace, so finding
 * UUIDs don't collide across brands even with identical content).
 * Name: descriptor_key + "|" + canonical(observation).
 *
 * Risk: if the LLM rephrases an observation slightly between runs, the hash
 * differs and the finding looks new. Acceptable for v1; future work could
 * add embedding-based similarity matching as a fallback layer.
 */
function deterministicFindingId(args: {
  brandId: string;
  descriptorKey: string | null;
  observation: string;
}): string {
  const canonical = args.observation.trim().toLowerCase().replace(/\s+/g, " ");
  const name = `${args.descriptorKey ?? "_null"}|${canonical}`;
  return uuidv5(name, args.brandId);
}
import type {
  BrandIdentityObservationPayload,
  DescriptorObservation,
} from "./aesthetic-observation-types";
import type {
  ReadinessFinding,
  ReadinessFindingsPayload,
  FindingAttribution,
  FindingSeverity,
} from "./readiness-findings-types";

const MODEL = "claude-sonnet-4-6";
const PROMPT_VERSION = "readiness_findings_prompt_text_v1";

const anthropic = new Anthropic();

// ── The full consolidator entry point ───────────────────────────────────────

export async function consolidateReadinessFindings(args: {
  businessId: string;
}): Promise<{ persisted: boolean; substrateId?: string; reason?: string; counts?: { total: number } }> {
  const { businessId } = args;

  const observationRow = await getSubstrate<BrandIdentityObservationPayload>(
    businessId,
    "public_presence_observation",
  );
  if (!observationRow) {
    return { persisted: false, reason: "no public_presence_observation substrate exists for this brand" };
  }

  // 1 + 2 — extract candidate findings algorithmically.
  // businessId threaded through for deterministic finding UUIDs.
  const candidates = extractCandidateFindings(observationRow.payload, businessId);

  // 3 — single batch LLM call to generate prompt_text per finding.
  const promptTexts = candidates.length > 0
    ? await generatePromptTexts(candidates)
    : [];

  const findings: ReadinessFinding[] = candidates.map((c, i) => ({
    ...c,
    prompt_text: promptTexts[i] ?? defaultPromptText(c),
  }));

  // 4 — persist as substrate.
  const generatedAt = new Date().toISOString();
  const payload: ReadinessFindingsPayload = {
    findings,
    meta: {
      source_substrate_id: observationRow.id,
      source_substrate_kind: "public_presence_observation",
      generated_at: generatedAt,
      model_for_prompt_text: MODEL,
      prompt_version: PROMPT_VERSION,
      counts: countFindings(findings),
    },
  };

  const { id: substrateId } = await upsertSubstrate({
    businessId,
    kind: "readiness_findings",
    payload: payload as unknown as Record<string, unknown>,
    generationMetadata: {
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      generated_at: generatedAt,
      inputs: {
        source_substrate_id: observationRow.id,
        candidate_count: candidates.length,
      },
    },
  });

  return {
    persisted: true,
    substrateId,
    counts: { total: findings.length },
  };
}

// ── 1 + 2: candidate finding extraction + classification ────────────────────

/** Pre-prompt-text finding shape — everything except the LLM-generated prompt. */
type CandidateFinding = Omit<ReadinessFinding, "prompt_text">;

function extractCandidateFindings(
  payload: BrandIdentityObservationPayload,
  brandId: string,
): CandidateFinding[] {
  const out: CandidateFinding[] = [];

  // 1. Each gaps_and_absences entry → defaults to brand_gap; cross-surface
  //    mismatches get reclassified to `inconsistency`.
  for (const gap of payload.gaps_and_absences ?? []) {
    out.push({
      id: deterministicFindingId({ brandId, descriptorKey: null, observation: gap }),
      observation: gap,
      evidence: [],  // gaps don't have positive evidence by definition
      source_pipeline: "public_presence_observation",
      attribution: detectInconsistency(gap) ? "inconsistency" : "brand_gap",
      severity: severityForGap(gap),
      descriptor_key: null,
    });
  }

  // 2. Each distinctive_elements_vs_category_defaults entry → external,
  //    informational. These are intentional choices the brand has made; we
  //    surface them as "tell us about this" prompts but they don't gate.
  for (const distinctive of payload.distinctive_elements_vs_category_defaults ?? []) {
    out.push({
      id: deterministicFindingId({ brandId, descriptorKey: null, observation: distinctive }),
      observation: distinctive,
      evidence: [],  // distinctives are themselves the observation summary
      source_pipeline: "public_presence_observation",
      attribution: "external",
      severity: "informational",
      descriptor_key: null,
    });
  }

  // 3. Per-descriptor — non-null slots produce one finding per descriptor.
  //    Severity is `refinement` by default; per-descriptor observations that
  //    notably describe a cross-surface mismatch (e.g. visual.palette noting
  //    "lime green absent from website UI") get reclassified to inconsistency.
  walkDescriptors(payload, (domain, key, slot) => {
    if (slot === null) return;
    const observationText = summarizeDescriptorObservation(slot.observed);
    const descriptorKey = `${domain}.${key}`;
    out.push({
      id: deterministicFindingId({ brandId, descriptorKey, observation: observationText }),
      observation: observationText,
      evidence: slot.evidence ?? [],
      source_pipeline: "public_presence_observation",
      attribution: detectInconsistency(observationText) ? "inconsistency" : "external",
      severity: "refinement",
      descriptor_key: descriptorKey,
    });
  });

  return out;
}

/**
 * Detect cross-surface mismatches in finding text. A finding is an
 * `inconsistency` (rather than a pure brand_gap or external observation) when
 * it explicitly references TWO surfaces the owner controls AND uses contrast
 * language indicating one surface doesn't match the other. Examples:
 *
 *   "logo's lime green ... but it doesn't appear anywhere in your website's UI"
 *   "GBP lists Interior Designer ... but neither term appears in homepage copy"
 *   "interior remodeling listed as a category in your GBP ... not visible in
 *    any of your public sources"
 *
 * Without two surfaces + contrast language, falls through to the caller's
 * default classification (brand_gap for absences, external for single-surface
 * observations). Tier 3 v1 heuristic; precision matters more than recall here
 * because over-flagging inconsistencies just routes findings through a slightly
 * different voice template — not catastrophic.
 */
function detectInconsistency(text: string): boolean {
  const lower = text.toLowerCase();

  const surfaceKeywords = [
    "logo",
    "website",
    "site",
    " ui ",
    "ui ",
    "homepage",
    "home page",
    "gbp",
    "google business",
    "footer",
    "header",
    "navigation",
    " nav ",
    "copy",
    "social",
    "profile",
    "color system",
    "palette",
  ];

  const surfacesFound = new Set<string>();
  for (const kw of surfaceKeywords) {
    if (lower.includes(kw)) {
      // Normalize variants ("ui ", " ui ") into one key for counting.
      surfacesFound.add(kw.trim());
    }
  }
  if (surfacesFound.size < 2) return false;

  const contrastPatterns: RegExp[] = [
    /\bbut\b[^.]*\b(doesn'?t|isn'?t|don'?t|aren'?t|never|no|not|neither)\b[^.]*\b(appear|reflect|mention|match|carry|present|visible)\b/i,
    /\babsent from\b/i,
    /\bdoesn'?t (appear|reflect|mention|match|carry|carry through)\b/i,
    /\bisn'?t reflected\b/i,
    /\bwhile\b[^.]*\b(doesn'?t|isn'?t|never|neither)\b/i,
    /\bwhereas\b/i,
    /\beven though\b/i,
    /\b(yet|though)\b[^.]*\b(doesn'?t|isn'?t|neither)\b/i,
    // "neither X mentioned/reflected/visible..." — set-negation form (e.g.
    // "neither of these are mentioned in homepage copy"). Different from
    // literal "not mentioned"; needed for substrate text that pluralizes the
    // negated subject.
    /\b(neither|none)\b[^.]{0,80}\b(mentioned|reflected|visible|appear|appears|match|matches|present)\b/i,
    /\bnot reflected\b/i,
    /\bnot mentioned\b/i,
    /\bnowhere in\b/i,
    /\bentirely absent\b/i,
  ];

  return contrastPatterns.some((p) => p.test(lower));
}

/**
 * Heuristic severity assignment for gap findings. Critical strategic dimensions
 * (positioning, audience, tone) absent → blocking. Other absences → refinement.
 * Empirical refinement of these heuristics is deferred to Tier 3+.
 */
function severityForGap(gapText: string): FindingSeverity {
  const lower = gapText.toLowerCase();
  // Critical absences that gate production.
  if (
    lower.includes("positioning") ||
    lower.includes("tagline") ||
    lower.includes("about narrative") ||
    lower.includes("audience")
  ) {
    return "blocking";
  }
  // Common informational absences that don't gate (no team/about/social isn't
  // a blocker for content generation; just FYI).
  if (
    lower.includes("team") ||
    lower.includes("founder") ||
    lower.includes("social media") ||
    lower.includes("blog content") ||
    lower.includes("video content") ||
    lower.includes("mobile") ||
    lower.includes("not capturable")
  ) {
    return "informational";
  }
  // Default — could go either way; refinement is the safe middle.
  return "refinement";
}

function summarizeDescriptorObservation(observed: unknown): string {
  if (typeof observed === "string") return observed;
  if (Array.isArray(observed)) return observed.join(", ");
  if (observed && typeof observed === "object") {
    // For structured observations, flatten to a compact summary.
    const entries = Object.entries(observed as Record<string, unknown>);
    return entries
      .map(([k, v]) => {
        const val = Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : JSON.stringify(v);
        return `${k}: ${val}`;
      })
      .join("; ");
  }
  return String(observed);
}

function walkDescriptors(
  payload: BrandIdentityObservationPayload,
  visit: (domain: string, key: string, slot: DescriptorObservation<unknown> | null) => void,
): void {
  for (const domain of ["verbal", "strategic", "visual", "sonic"] as const) {
    const block = payload[domain] as Record<string, DescriptorObservation<unknown> | null>;
    if (!block) continue;
    for (const [key, slot] of Object.entries(block)) {
      visit(domain, key, slot);
    }
  }
}

function countFindings(findings: ReadinessFinding[]): ReadinessFindingsPayload["meta"]["counts"] {
  const by_severity: Record<FindingSeverity, number> = {
    blocking: 0,
    refinement: 0,
    informational: 0,
  };
  const by_attribution: Record<FindingAttribution, number> = {
    external: 0,
    inconsistency: 0,
    brand_gap: 0,
  };
  for (const f of findings) {
    by_severity[f.severity]++;
    by_attribution[f.attribution]++;
  }
  return { total: findings.length, by_severity, by_attribution };
}

// ── 3: LLM voice-templated prompt_text generation ───────────────────────────

function buildPromptTextSystemPrompt(): string {
  return `You are a senior brand analyst preparing the agency's initial assessment deliverable for a client. You have a list of findings observed about the client's brand from publicly accessible sources. Your job is to write the owner-facing prompt text for each finding — the phrasing the owner will read when reviewing the deliverable.

The prompt text should follow the assessment-as-conversation framing, NOT findings-as-task. Diagnostic, agency-tone — not directive, dashboard-tone. The owner is a partner who probably has reasons; ask them to explain, not to fix.

VOICE TEMPLATES BY ATTRIBUTION:

- attribution=external — Conversational, question-shaped. Single-surface observation; treat the owner as having reasons; ask them to explain. Examples:
    "We noticed your CTA reads 'Tell Us What Happened' rather than the typical 'Get a Quote' — what's behind that choice?"
    "You're deploying technical vocabulary in your primary copy rather than translating it. Was that a deliberate audience-qualification move?"

- attribution=inconsistency — Question-shaped but focused on RECONCILING two surfaces. The brand has a signal on one surface but it doesn't match (or doesn't appear) on another. Ask the owner to clarify which version is canonical, OR whether the separation between surfaces is intentional. Don't presume one is correct. Examples:
    "Your logo uses lime green but your website UI doesn't reflect that — was the logo/site separation deliberate, or should lime expand to UI accents?"
    "Your GBP lists Interior Designer as a category but your homepage doesn't mention it — should we drop the category or add it to your homepage's offering taxonomy?"
    "Interior remodeling is listed in your GBP categories but no interior photography appears in your public sources — is interior work a smaller part of the business, or just not represented yet?"

- attribution=brand_gap — Consultative, proposing direction. Signal absent from the brand ENTIRELY (no second surface to reconcile against). Owner has nothing to defend; system surfaces what's missing and proposes shape. Examples:
    "We didn't see a team or founder presence anywhere on your public surfaces. Most clients in your space build trust through this — would you like to develop one?"
    "There's no consistent tagline visible across your site. Want help developing one?"

DISCIPLINE:
- One concise prompt per finding. 1-3 sentences max.
- Reference the SPECIFIC observation, not generic agency-speak. If the observation mentions lime green, the prompt mentions lime green.
- Match the voice template to the attribution exactly — don't pose a brand_gap finding as a critique of something the brand did; don't ask "is this canonical?" of an external finding when there's no second surface to reconcile.
- Don't editorialize about whether the observation is good or bad. Stay diagnostic.

OUTPUT: a single valid JSON object: { "prompts": ["prompt for finding 1", "prompt for finding 2", ...] } — array in the same order as the input findings. No prose, no markdown fences.`;
}

function buildPromptTextUserContent(candidates: CandidateFinding[]): string {
  const lines: string[] = [];
  lines.push("Generate the owner-facing prompt_text for each of the following findings, in order:\n");
  candidates.forEach((c, i) => {
    lines.push(`--- Finding ${i + 1} ---`);
    lines.push(`attribution: ${c.attribution}`);
    lines.push(`severity: ${c.severity}`);
    if (c.descriptor_key) lines.push(`descriptor: ${c.descriptor_key}`);
    lines.push(`observation: ${c.observation}`);
    if (c.evidence.length > 0) {
      lines.push(`evidence:`);
      for (const e of c.evidence) lines.push(`  - ${e}`);
    }
    lines.push("");
  });
  lines.push(`Return: { "prompts": ["...", "...", ...] } — ${candidates.length} entries, same order.`);
  return lines.join("\n");
}

async function generatePromptTexts(candidates: CandidateFinding[]): Promise<string[]> {
  if (candidates.length === 0) return [];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: buildPromptTextSystemPrompt(),
    messages: [
      {
        role: "user",
        content: buildPromptTextUserContent(candidates),
      },
    ],
  });

  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  try {
    const parsed = JSON.parse(cleaned) as { prompts: string[] };
    if (!Array.isArray(parsed.prompts)) {
      throw new Error("response missing prompts array");
    }
    if (parsed.prompts.length !== candidates.length) {
      console.warn(
        `[readiness-findings] LLM returned ${parsed.prompts.length} prompts for ${candidates.length} candidates; padding/truncating`,
      );
    }
    // Defensive: pad with default if shorter, truncate if longer.
    return candidates.map((c, i) => parsed.prompts[i] ?? defaultPromptText(c));
  } catch (e) {
    console.warn(
      `[readiness-findings] non-JSON or malformed prompt_text response; falling back to defaults`,
      e instanceof Error ? e.message : String(e),
    );
    return candidates.map(defaultPromptText);
  }
}

/** Fallback prompt when LLM call fails or returns malformed. */
function defaultPromptText(c: CandidateFinding): string {
  if (c.attribution === "brand_gap") {
    return `We didn't observe: ${c.observation}. Walk us through whether this matters for your brand.`;
  }
  if (c.attribution === "inconsistency") {
    return `We noticed an inconsistency: ${c.observation}. Which version reflects what you'd consider canonical?`;
  }
  return `We observed: ${c.observation}. Tell us about this.`;
}

// ── Read accessor ──────────────────────────────────────────────────────────

export async function getReadinessFindings(
  businessId: string,
): Promise<ReadinessFindingsPayload | null> {
  const row = await getSubstrate<ReadinessFindingsPayload>(businessId, "readiness_findings");
  return row?.payload ?? null;
}

/**
 * Read the findings substrate WITH its row id. Resolution actions need the
 * findings substrate id (to detect across regenerations whether a stored
 * resolution still belongs to the current run).
 */
export async function getReadinessFindingsWithId(
  businessId: string,
): Promise<{ id: string; payload: ReadinessFindingsPayload } | null> {
  const row = await getSubstrate<ReadinessFindingsPayload>(businessId, "readiness_findings");
  if (!row) return null;
  return { id: row.id, payload: row.payload };
}

/** When was the readiness_findings substrate last generated for this business? */
export async function getReadinessFindingsUpdatedAt(businessId: string): Promise<string | null> {
  const [row] = await sql`
    SELECT updated_at
    FROM business_substrate
    WHERE business_id = ${businessId} AND kind = 'readiness_findings'
    LIMIT 1
  `;
  return row ? (row.updated_at as Date).toISOString() : null;
}
