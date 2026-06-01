/**
 * Context validator — the quality gate.
 *
 * Per-descriptor LLM call (Haiku) that reads the descriptor's coaching + each
 * sub-input's prompt + the owner's value, and returns findings per sub-input
 * (verdict + reason + suggestion). The page renders warnings inline and gates
 * the Extract button on all-pass.
 *
 * Methodology (locked 2026-05-30): HARD-PASS-ONLY. No "Keep mine" escape, no
 * acknowledgment yet. Per-descriptor call (not per-sub-field — gives the model
 * full context to spot cross-slot incoherence). Stale on edit (cleared by
 * setDeclared automatically). Fail-open on infrastructure errors.
 */
import "server-only";
import { sql } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { getDescriptorByKey, type DescriptorSpec } from "./catalog";
import { setExtractedSubstrate, type SubstrateCachePersist } from "./store";

const anthropic = new Anthropic();

/**
 * Stage-1 substrate cache shape. The persisted form (in
 * `metadata.extracted_substrate.{inputKey}`) matches `SubstrateCachePersist`
 * from store.ts — re-exported here as the validator's working type.
 *
 * `source_text` is the verbatim `owner_original.{inputKey}` used at extraction
 * time; the cache hit predicate is `source_text === currentOwnerOriginal`.
 * If the owner edits their original (rare; first-save-wins) the hash mismatches
 * and Stage 1 re-runs.
 */
type SubstrateCache = SubstrateCachePersist;

export type ValidationVerdict = "pass" | "warn" | "attention";

/**
 * Per-source-labeled quality demonstration for a finding. Replaces the older
 * `suggestion` field that conflated slot-replacement with quality-exemplification.
 */
export type ExemplarSource = "existing" | "rephrased" | "new";

export interface Exemplar {
  content: string;
  /**
   *  - `"existing"`: verbatim owner content that ALREADY meets the descriptor's
   *    bar; included to validate the owner's good work. `fromSlot` set.
   *  - `"rephrased"`: owner's borderline content sharpened — same idea, stronger
   *    framing. Owner sees their thinking acknowledged + improved. `fromSlot` set.
   *  - `"new"`: fresh demonstration from substrate (example prose, etc.).
   *    `fromSlot` not set. Subject to the anchoring rule.
   */
  source: ExemplarSource;
  fromSlot?: number;
}

export interface ValidationFinding {
  inputKey: string;
  verdict: ValidationVerdict;
  /** One-sentence explanation when not `pass`; empty when pass. */
  reason: string;
  /**
   * Per-source-labeled quality demonstrations. Not slot-mapped replacements;
   * the validator is showing the SHAPE of good content, not writing the owner's
   * content for them. Owner reads, then edits their fields manually.
   */
  exemplars?: Exemplar[];
}

export interface DescriptorValidationResult {
  /** Descriptor key. */
  key: string;
  /** Findings per sub-input (or single entry for non-decomposed descriptors). */
  findings: ValidationFinding[];
  /** Wall-clock timestamp; persisted with the findings. */
  checkedAt: string;
  /** Model used (for provenance + future re-validation triggers). */
  model: string;
  /** If validator infrastructure failed, the error message. Empty findings + this set = fail-open. */
  error?: string;
}

const MODEL = "claude-haiku-4-5-20251001";

function parseJsonStrict<T>(raw: string, label: string): T {
  try {
    return extractJsonObject(raw) as T;
  } catch (err) {
    throw new Error(`${label}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Stage-1: extract concrete factual primitives from owner-written prose.
 * Runs ONCE per `owner_original.{inputKey}` value; result is cached in
 * `metadata.extracted_substrate.{inputKey}`. Caller passes the cached value
 * if present and matching; this function is the cache-miss path.
 *
 * The substrate is the validator's stable anchor for prose — by extracting
 * concrete facts once and feeding them into every Stage-2 validation, we
 * break the iteration-against-own-output drift loop.
 */
/**
 * Robust JSON extraction from an LLM text response. Models sometimes wrap
 * their JSON in markdown fences or add explanatory text before/after. We
 * try a few strategies before giving up.
 */
function extractJsonObject(raw: string): unknown {
  // 1) Strip ```json ... ``` or ``` ... ``` fences if present
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try { return JSON.parse(fenced[1]); } catch { /* fall through */ }
  }
  // 2) Find the FIRST balanced JSON object via brace counting
  const start = raw.indexOf("{");
  if (start === -1) throw new Error(`no JSON object in response: ${raw.slice(0, 200)}`);
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) {
        const slice = raw.slice(start, i + 1);
        try { return JSON.parse(slice); } catch (err) {
          throw new Error(
            `JSON.parse failed on extracted slice: ${(err as Error).message} | raw=${raw.slice(0, 400)}`,
          );
        }
      }
    }
  }
  throw new Error(`unbalanced JSON in response: ${raw.slice(0, 200)}`);
}

async function extractSubstrate(ownerOriginalText: string): Promise<SubstrateCache> {
  const prompt = `Extract concrete factual primitives from this owner-written prose.

CONCRETE FACTS = specific places, materials, scales, processes, problems, methods, outcomes, claims the owner stated. Each fact should stand alone as a verifiable claim.

IGNORE framing language, abstract polish, and softeners. These are NOT facts (illustrative, not exhaustive):
  · "transcends time" / "timeless"
  · "masterpiece worthy of legacy"
  · "newly found legacy"
  · "vision realized" / "dreams come true"
  · "stunning transformation"
  · "coherent home" / "reads as original" / "feels seamless"

OWNER'S PROSE:
"""
${ownerOriginalText}
"""

Return ONLY JSON, no markdown:
{ "facts": ["fact 1", "fact 2", ...] }`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");
  const parsed = parseJsonStrict<{ facts: unknown }>(text, "extractSubstrate");
  const facts = Array.isArray(parsed.facts)
    ? parsed.facts.filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    : [];
  return {
    facts,
    source_text: ownerOriginalText,
    extracted_at: new Date().toISOString(),
    model: MODEL,
  };
}

/**
 * Cache-aware substrate accessor. Returns the cached value if its `source_text`
 * matches the current owner_original; otherwise runs Stage-1 extraction and
 * persists the result before returning.
 */
async function getOrExtractSubstrate(
  brandIdentityId: string,
  key: string,
  inputKey: string,
  ownerOriginalText: string,
  existingCache: SubstrateCache | undefined,
): Promise<SubstrateCache> {
  if (existingCache && existingCache.source_text === ownerOriginalText) {
    return existingCache;
  }
  const cache = await extractSubstrate(ownerOriginalText);
  await setExtractedSubstrate(brandIdentityId, key, inputKey, cache);
  return cache;
}

/**
 * Pull a string value out of an owner_original / declared object for a given
 * sub-input key. Returns empty string if missing or empty.
 */
function readStringInput(
  source: Record<string, unknown> | null | undefined,
  inputKey: string,
): string {
  if (!source) return "";
  const v = source[inputKey];
  return typeof v === "string" ? v : "";
}

/**
 * Pull a list value (string[]) out of an owner_original / declared object.
 * Filters out empty/non-string items.
 */
function readListInput(
  source: Record<string, unknown> | null | undefined,
  inputKey: string,
): string[] {
  if (!source) return [];
  const v = source[inputKey];
  if (!Array.isArray(v)) return [];
  return v.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
}

/**
 * Validation scope — controls which inputs render in the prompt + which inputs
 * the model is asked to produce findings for.
 *
 * Two modes, motivated by the substrate-boundary lesson on the prose-input
 * oscillation:
 *  - `"lists"` — payload includes ALL inputs (lists + prose) as context, so
 *    the model can use the prose's flavor when generating list exemplars; but
 *    findings are produced ONLY for list keys.
 *  - `"prose"` — payload includes ONLY the named prose input + its substrate.
 *    No sibling context. Prevents the model from cross-pulling facts from
 *    services/benefits into the prose exemplar (the failure mode observed
 *    when the validator added "in-house crews" to the Squirrel Hill rewrite).
 */
type ValidatorScope =
  | { mode: "lists"; outputKeys: string[] }
  | { mode: "prose"; proseKey: string };

function renderInputBlock(
  spec: DescriptorSpec,
  declared: unknown,
  ownerOriginal: Record<string, unknown>,
  substrateByInput: Record<string, SubstrateCache>,
  scope: ValidatorScope,
): string {
  if (!spec.inputs) {
    // Non-decomposed: single-textarea descriptor. Always treated as prose.
    if (scope.mode !== "prose" || scope.proseKey !== "text") return "";
    const current =
      typeof declared === "string"
        ? declared
        : declared && typeof declared === "object"
          ? JSON.stringify(declared)
          : "";
    const original = readStringInput(ownerOriginal, "text");
    const substrate = substrateByInput["text"];
    return renderProseBlock("text", spec.describes, original, substrate, current);
  }

  const declaredObj =
    declared && typeof declared === "object"
      ? (declared as Record<string, unknown>)
      : {};
  const blocks: string[] = [];
  for (const input of spec.inputs) {
    if (scope.mode === "prose") {
      // Prose scope: render ONLY the named prose input. Total isolation —
      // sibling inputs are deliberately omitted so the model can't cross-pull.
      if (input.key !== scope.proseKey) continue;
      if (input.inputType !== "prose") continue;
      const current = readStringInput(declaredObj, input.key);
      const original = readStringInput(ownerOriginal, input.key);
      if (!current.trim() && !original.trim()) continue;
      const substrate = substrateByInput[input.key];
      blocks.push(renderProseBlock(input.key, input.prompt, original, substrate, current));
      continue;
    }
    // Lists scope: render every input (lists for output, prose as context).
    if (input.inputType === "prose") {
      const current = readStringInput(declaredObj, input.key);
      const original = readStringInput(ownerOriginal, input.key);
      if (!current.trim() && !original.trim()) continue;
      const substrate = substrateByInput[input.key];
      blocks.push(renderProseBlock(input.key, input.prompt, original, substrate, current));
    } else {
      const currentList = readListInput(declaredObj, input.key);
      const originalList = readListInput(ownerOriginal, input.key);
      if (currentList.length === 0 && originalList.length === 0) continue;
      blocks.push(renderListBlock(input.key, input.prompt, originalList, currentList));
    }
  }
  return blocks.join("\n");
}

function renderProseBlock(
  inputKey: string,
  promptText: string,
  _ownerOriginalText: string,
  substrate: SubstrateCache | undefined,
  currentText: string,
): string {
  // Per [[default-to-isolation]] / cross-input contamination lesson:
  // Stage 2 prose payload INTENTIONALLY OMITS owner_original. Stage 1
  // already distilled owner_original into the substrate facts; including
  // owner_original here makes the model anchor on its phrasing (including
  // any polish) and report it as if it's in current — the exact failure
  // mode observed 2026-06-01 when re-validation of an accepted clean
  // exemplar kept flagging owner_original's polish phrases. Substrate is
  // the canonical truth; current is the artifact under assessment.
  const lines: string[] = [];
  lines.push(`=== ${inputKey} (prose) ===`);
  lines.push(`Prompt asked: ${promptText}`);
  if (substrate && substrate.facts.length > 0) {
    lines.push(
      "CONCRETE FACTS (the canonical substrate — every fact in this list must be present in the exemplar; no other facts are valid):",
    );
    for (const fact of substrate.facts) {
      lines.push(`  · ${fact}`);
    }
  }
  if (currentText.trim()) {
    lines.push(
      "Current version (THIS is the artifact to assess against the three criteria — verdict and exemplar derive from THIS, anchored to the facts above):",
    );
    lines.push(`"""${currentText}"""`);
  }
  return lines.join("\n") + "\n";
}

function renderListBlock(
  inputKey: string,
  promptText: string,
  ownerOriginalList: string[],
  currentList: string[],
): string {
  const lines: string[] = [];
  lines.push(`=== ${inputKey} (list) ===`);
  lines.push(`Prompt asked: ${promptText}`);
  if (ownerOriginalList.length > 0) {
    lines.push("Owner's ORIGINAL list (the anchor — owner's first authentic entries):");
    ownerOriginalList.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
  }
  if (currentList.length > 0) {
    const identical =
      currentList.length === ownerOriginalList.length &&
      currentList.every((s, i) => s.trim() === (ownerOriginalList[i] ?? "").trim());
    if (identical && ownerOriginalList.length > 0) {
      lines.push("Current version: IDENTICAL to the original above.");
    } else {
      lines.push("Current version (what's saved now — may be a previously-accepted rewrite; existing/rephrased fromSlot indices refer to THIS list):");
      currentList.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    }
  }
  return lines.join("\n") + "\n";
}

function buildValidatorPrompt(
  spec: DescriptorSpec,
  declared: unknown,
  ownerOriginal: Record<string, unknown>,
  substrateByInput: Record<string, SubstrateCache>,
  scope: ValidatorScope,
): string {
  const inputBlock = renderInputBlock(spec, declared, ownerOriginal, substrateByInput, scope);
  const outputKeyList =
    scope.mode === "lists"
      ? scope.outputKeys.map((k) => `"${k}"`).join(", ")
      : `"${scope.proseKey}"`;

  // Scope-specific orientation: lists call sees siblings for brand flavor;
  // prose call is fully isolated to prevent cross-input fact pollution.
  const scopeBlock =
    scope.mode === "lists"
      ? `THIS CALL VALIDATES LIST INPUTS ONLY: ${outputKeyList}
Other inputs may appear above as CONTEXT — use them to understand the brand's overall flavor, but DO NOT produce findings for them. Findings are scoped strictly to the list inputs named here.`
      : `THIS CALL VALIDATES ONE PROSE INPUT IN ISOLATION: ${outputKeyList}
No sibling inputs are shown. The exemplar must be grounded EXCLUSIVELY in this prose's own owner_original and its extracted CONCRETE FACTS — do NOT introduce facts that might be true of the brand but are not present in this prose's substrate. Cross-input fact pollution is the failure mode this isolation prevents.`;

  return `You are reviewing a small business owner's brand identity declared inputs for ONE descriptor. Your job: evaluate the in-scope inputs and produce findings + exemplars where needed.

DESCRIPTOR: "${spec.label}" (${spec.domain}.${spec.key})

WHAT THIS DESCRIPTOR CAPTURES:
${spec.describes}

${scopeBlock}

ARTIFACTS YOU MAY SEE (varies by input type):
  - For LIST inputs: Owner's ORIGINAL list (the anchor — the owner's first authentic entries) and the Current list.
  - For PROSE inputs: CONCRETE FACTS (the canonical truth, distilled once from the owner's original and cached as the immutable anchor) and the Current version. owner_original itself is INTENTIONALLY OMITTED for prose — the substrate facts already contain everything you need; including the raw original would let polish phrases bleed into your assessment of current, which is the contamination failure mode this architecture prevents.

Your verdict and exemplar anchor to the OWNER'S ORIGINAL list (for lists) or to the CONCRETE FACTS (for prose). The anchor never moves across accept cycles — it's the stable reference that prevents drift. Assess current against the anchor; do NOT iterate against current itself.

OWNER'S INPUTS:
${inputBlock}

For each in-scope input, apply the THREE-CRITERIA TEST. Verdicts are determined SOLELY by these three checks — nothing else.

(a) FACT COVERAGE — every concrete fact from the substrate (for prose inputs, the FACTS list shown above) or the owner's original list (for list inputs) is expressed in the current version. Missing facts → fail (a).

(b) NO EXPLICIT POLISH — the current contains NO phrases from the explicit polish list below, neither verbatim nor as trivial substitutions ("timeless" counts as "transcends time"; "world-class" as "best in class"). The list is EXHAUSTIVE for flagging — do NOT generalize patterns to similar shapes. If a phrase is not on the list or a trivial substitution of one, it is not polish.

EXPLICIT POLISH LIST (the complete and ONLY set of polish flags — IMPORTANT: when citing any of these phrases in your reason field, use SINGLE QUOTES around the phrase, not double quotes, so the JSON stays valid):
  Industry/genre cliches:
    · 'on time and on budget'
    · 'quality workmanship'
    · 'trusted partner'
    · 'stress-free management'
    · 'increase in value'
    · 'professional service'
    · 'best in class' / 'world-class'
    · 'industry-leading'
  Abstract marketing softeners:
    · 'transcends time' / 'timeless'
    · 'masterpiece' / 'masterpiece worthy of [anything]'
    · 'newly found legacy' / 'legacy' used as a closing flourish
    · 'vision realized' / 'dreams come true'
    · 'stunning transformation'
    · 'one-of-a-kind result'

(c) DESCRIPTOR PURPOSE — the input fully covers what the descriptor asks for. For "${spec.label}", that means BOTH service narrative AND beneficiary outcome should appear in the example (if the descriptor's purpose calls for both). Other input prompts make their own coverage requirements explicit above.

Verdict assignment:
- "pass" — ALL three criteria met (a + b + c).
- "warn" — exactly one criterion fails, or a borderline case (fact present but indirect, descriptor purpose partially covered).
- "attention" — multiple criteria fail, OR a single criterion fails substantially (wrong category, missing required dimension, multiple polish phrases).

VOICE NEUTRALITY (critical):
The validator is VOICE-NEUTRAL. The following are NOT criteria, do NOT affect verdict, and do NOT motivate exemplar changes:
  · Voice, tone, or "authenticity" of the current
  · Whether the current is "too flat" or "too polished"
  · Soft framing, observational phrases, negation phrasing, descriptive verbs
  · Stylistic variations between the original and current

Voice belongs to the owner. The validator checks ONLY (a), (b), (c). Do not advise on voice. Do not produce exemplars that "restore voice" or "add authenticity" — those changes are out of scope.

If verdict is "warn" or "attention", produce EXEMPLARS — quality demonstrations of what good content for this descriptor looks like for THIS brand. Exemplars are NOT slot-mapped replacements; you are showing the SHAPE of correct content, not writing the owner's content for them.

THREE SOURCES — assign one to each exemplar:

- **"existing"** with fromSlot: <0-based slot index> — when an owner slot entry ALREADY meets the bar fully (e.g. for benefits, it's clearly outcome-shaped, specific, client-grounded). PRESERVE VERBATIM. The owner sees their best work validated.

- **"rephrased"** with fromSlot: <0-based slot index> — when an owner slot entry has the right INTENT but lacks specificity, client-grounding, or distinctiveness. The owner's idea is the seed; sharpen it into a stronger form. Do NOT discard borderline content silently — sharpen and acknowledge it. The owner sees their thinking validated + improved.

- **"new"** — fresh demonstration grounded in the owner's example prose or other on-brand substrate. Anchoring rule applies (see below).

PRODUCING THE EXEMPLAR LIST:

Aim for N exemplars where N = the number of slots the owner filled. The substrate (example prose, descriptor coaching, slot content) typically contains enough angle variations to ground N brand-anchored exemplars. Work to find them before omitting:
- Different aspects of the example prose (setting, materials, process, outcome, identity).
- Different beneficiary lenses (homeowner experience, project journey, finished result, long-term value beyond money).
- Different time-horizons (during the project, at completion, decades later).

Borderline slots get **rephrased**, not silently dropped. Off-context slots (truly unrelated to the descriptor) get neither rephrased nor replaced — the owner needs to fix them manually.

Reaching N anchored exemplars is the target. Falling short is the fallback when the substrate genuinely cannot support more, not the goal.

EXEMPLAR ANCHORING — when verdict is "warn" or "attention", the exemplar MUST transform current to address every failing criterion. A verbatim copy of current is NEVER an acceptable exemplar when any criterion failed — that's not an exemplar, that's the problem.

For PROSE inputs (REQUIRED transformations when a criterion fails):
- If (a) failed: ADD the missing substrate facts. The exemplar MUST include every fact from the substrate list.
- If (b) failed: REMOVE every polish phrase from the explicit list that appears in current. The exemplar MUST NOT contain ANY phrase from that list, including: 'transcends time', 'timeless', 'masterpiece', 'masterpiece worthy of [anything]', 'newly found legacy', 'legacy' as a closing flourish, 'vision realized', 'dreams come true', 'stunning transformation', 'one-of-a-kind result', and the industry cliches. Do NOT remove or rewrite anything not on the list.
- If (c) failed: ADD a sentence (or clause) that satisfies the missing descriptor-purpose dimension (for offer.example: explicitly state what the client gained or experiences).
- Preserve everything else: voice, tone, narrative shape, sentence rhythm, owner's verbs/idioms.

WORKED TRANSFORMATION EXAMPLE (apply the same shape to your case):

Suppose current = "We built a 4-story addition to a 1920s home, blending modern techniques with traditional craft. The project transcends time and is a masterpiece worthy of legacy."

Substrate facts: ["4-story addition", "1920s home", "blending modern techniques with traditional craft"]

Failed criteria: (b) — "transcends time" and "masterpiece worthy of legacy" both on polish list. (c) — no client outcome.

Correct exemplar transformation:
"We built a 4-story addition to a 1920s home, blending modern techniques with traditional craft. The homeowners got the expanded space they wanted with the original character of their home intact."

What CHANGED: removed the two polish sentences (criterion b), added a homeowner-outcome sentence (criterion c). What did NOT change: substrate facts (still there), voice and sentence structure of the first sentence (preserved).

For LIST inputs: each exemplar grounds in the owner's ORIGINAL list (anchor) or in concrete substrate. The explicit polish list above applies — but only as a strict verbatim check, not as a pattern generalization.

EXEMPLAR DISCIPLINE (strict):
- If verdict is pass, exemplars is empty.
- If verdict is warn/attention, the exemplar MUST differ from current in the ways the failed criteria require. A returned exemplar that is verbatim of current is a failure mode — produce the transformation.
- Do NOT flag, replace, or "improve" observational phrases, negation framing, soft summaries, or any wording that is not on the EXPLICIT POLISH LIST above.
- Do NOT invent facts not in the substrate. Do NOT omit substrate facts.
- Voice belongs to the owner. Exemplars never "add voice," "restore authenticity," or "tighten tone." Those are out of scope.

EXEMPLAR SHAPE:
- For inputs marked "(prose)": exemplars is an array with EXACTLY ONE entry. No alternatives, no variations. The single exemplar is what the owner will accept with one click. Source preference (strict): "rephrased" > "new" — when the owner's content has the right intent/structure (even with polish), the exemplar must be "rephrased" preserving voice/order with polish removed. Only use "new" when the owner's content is structurally unusable (truly off-topic). Never use "existing" unless verdict is "pass" (and then exemplars is empty).
- For inputs marked "(list)": exemplars is an array of {content, source, fromSlot?} objects, one per slot — these are complementary members of the new list, not alternatives.

Return ONLY JSON, no markdown, no preamble. The "findings" array must contain ONE entry per in-scope key — these keys exactly: ${outputKeyList}. Do NOT include findings for any other inputs.

JSON QUOTING DISCIPLINE (CRITICAL): the "reason" field is a JSON string. Any quoted phrase citation inside it MUST use SINGLE QUOTES (apostrophes), never unescaped double quotes. Example of correct: "reason": "Criterion (b) fails: contains 'transcends time' and 'masterpiece'." — uses single quotes around cited phrases. Example of broken JSON: "reason": "contains "transcends time"" — double quotes here close the string prematurely and break parsing. When in doubt, use single quotes.

{
  "findings": [
    {
      "inputKey": "<one of the in-scope keys>",
      "verdict": "pass" | "warn" | "attention",
      "reason": "<one sentence; empty string if pass>",
      "exemplars": [
        { "content": "<string>", "source": "existing", "fromSlot": <0-indexed number> },
        { "content": "<sharpened version>", "source": "rephrased", "fromSlot": <0-indexed number> },
        { "content": "<string>", "source": "new" }
      ]
    }
  ]
}

If verdict is "pass", exemplars should be empty (the owner doesn't need demonstrations of what good looks like — they already have it).`;
}

/**
 * Validate one descriptor. Hits Haiku, returns findings.
 * Fails open: on any infrastructure error, returns an empty `findings` array
 * plus `error` set — callers should treat that as "could not validate; do not
 * block."
 */
/**
 * Optional filter restricting `validateDescriptor` to a subset of scopes.
 * Per [[descriptor-design-protocol]] each decomposed descriptor has multiple
 * validation groups; the UI surfaces per-group triggers so the owner can
 * re-validate only what they edited.
 *
 *  - `{ kind: "lists" }` — run only the list-inputs call.
 *  - `{ kind: "prose", proseKey }` — run only that single prose call.
 *  - undefined — run every scope (the default, used by validateBrandIdentity).
 */
export type ScopeFilter =
  | { kind: "lists" }
  | { kind: "prose"; proseKey: string };

export async function validateDescriptor(
  brandIdentityId: string,
  key: string,
  scopeFilter?: ScopeFilter,
): Promise<DescriptorValidationResult> {
  const spec = getDescriptorByKey(key);
  if (!spec) throw new Error(`validateDescriptor: unknown descriptor key '${key}'`);

  const [row] = await sql`
    SELECT declared, metadata
    FROM brand_descriptor
    WHERE brand_identity_id = ${brandIdentityId} AND domain = ${spec.domain} AND key = ${key}
    LIMIT 1
  `;
  if (!row) {
    throw new Error(
      `validateDescriptor: no row for '${key}' on brand identity ${brandIdentityId}`,
    );
  }

  // Anchor inputs: owner_original carries the immutable first-saved owner
  // version per sub-input (captured by setDeclared). When absent (legacy rows
  // that predate this mechanism), fall back to the current declared — preserves
  // legacy behavior; once owner re-saves, the anchor is captured for real.
  const metadata = (row.metadata as Record<string, unknown> | null) ?? {};
  const ownerOriginalRaw = metadata.owner_original;
  const ownerOriginal: Record<string, unknown> =
    ownerOriginalRaw && typeof ownerOriginalRaw === "object" && !Array.isArray(ownerOriginalRaw)
      ? (ownerOriginalRaw as Record<string, unknown>)
      : (() => {
          // Legacy fallback: treat current declared as the anchor.
          if (typeof row.declared === "string") return { text: row.declared };
          if (row.declared && typeof row.declared === "object" && !Array.isArray(row.declared)) {
            return row.declared as Record<string, unknown>;
          }
          return {};
        })();

  // Stage 1: ensure extracted_substrate cache exists for every prose input
  // with an owner_original. Cache hit predicate: source_text === current
  // owner_original. Misses (or never-extracted) trigger an LLM call here,
  // synchronously, before Stage 2 (the validator call).
  const existingSubstrateRaw = metadata.extracted_substrate;
  const existingSubstrate: Record<string, SubstrateCache> =
    existingSubstrateRaw && typeof existingSubstrateRaw === "object" && !Array.isArray(existingSubstrateRaw)
      ? (existingSubstrateRaw as Record<string, SubstrateCache>)
      : {};
  const substrateByInput: Record<string, SubstrateCache> = {};
  const proseInputs: Array<{ key: string }> = spec.inputs
    ? spec.inputs.filter((i) => i.inputType === "prose").map((i) => ({ key: i.key }))
    : typeof row.declared === "string"
      ? [{ key: "text" }]
      : [];
  for (const input of proseInputs) {
    const original = readStringInput(ownerOriginal, input.key);
    if (!original.trim()) continue;
    try {
      substrateByInput[input.key] = await getOrExtractSubstrate(
        brandIdentityId,
        key,
        input.key,
        original,
        existingSubstrate[input.key],
      );
    } catch (err) {
      // Stage 1 failure is non-fatal — validator continues — but log loudly
      // so the developer sees what went wrong (parse error, network, refusal,
      // etc.). Without this log, Stage 1 failures look identical to empty
      // substrate at the route layer.
      console.error(
        `[validate] Stage 1 substrate extraction failed for ${key}.${input.key}:`,
        err instanceof Error ? err.message : err,
      );
      if (err instanceof Error && err.stack) console.error(err.stack);
    }
  }

  const checkedAt = new Date().toISOString();

  // Split orchestration: ONE call for all list inputs (with prose as context),
  // SEPARATE call per prose input (fully isolated). This was added 2026-05-31
  // after substrate boundary violation in the original single-call model — the
  // prose exemplar lifted facts from sibling list inputs (e.g. "in-house crews"
  // appearing in the example rewrite). Per-prose isolation prevents that.
  const listKeys: string[] = spec.inputs
    ? spec.inputs.filter((i) => i.inputType === "list").map((i) => i.key)
    : [];
  const proseKeys: string[] = spec.inputs
    ? spec.inputs.filter((i) => i.inputType === "prose").map((i) => i.key)
    : typeof row.declared === "string"
      ? ["text"]
      : [];

  // EMPTY-SUBSTRATE DETECTION (locked 2026-05-31, per
  // [[brand-identity-schema]] owners-embellish principle):
  // Per the realistic owner workflow, an owner_original may be hype-only with
  // zero extractable concrete facts. Stage 1 returns an empty facts list. In
  // that case the LLM has nothing to anchor to and Stage 2 cannot produce a
  // useful exemplar. We short-circuit with a deterministic finding directing
  // the owner to add concrete details OR Reset and re-enter. No LLM call.
  const earlyFindings: ValidationFinding[] = [];
  for (const proseKey of proseKeys) {
    if (scopeFilter?.kind === "lists") continue;
    if (scopeFilter?.kind === "prose" && scopeFilter.proseKey !== proseKey) continue;
    const original = readStringInput(ownerOriginal, proseKey);
    if (!original.trim()) continue; // unfilled — completion-gate concern, not quality
    const sub = substrateByInput[proseKey];
    if (!sub || sub.facts.length === 0) {
      earlyFindings.push({
        inputKey: proseKey,
        verdict: "attention",
        reason:
          "No concrete substrate could be extracted from your canonical prose. Add specific facts to the original (places, materials, scales, methods, outcomes), or use Reset to start over with new content.",
        exemplars: [],
      });
    }
  }
  const earlyKeys = new Set(earlyFindings.map((f) => f.inputKey));

  const scopes: ValidatorScope[] = [];
  if (listKeys.length > 0 && (!scopeFilter || scopeFilter.kind === "lists")) {
    scopes.push({ mode: "lists", outputKeys: listKeys });
  }
  for (const proseKey of proseKeys) {
    if (scopeFilter && scopeFilter.kind === "lists") continue;
    if (scopeFilter && scopeFilter.kind === "prose" && scopeFilter.proseKey !== proseKey) continue;
    if (earlyKeys.has(proseKey)) continue; // empty-substrate short-circuit
    scopes.push({ mode: "prose", proseKey });
  }

  if (scopes.length === 0 && earlyFindings.length === 0) {
    // No inputs to validate (descriptor has no content). Return empty.
    return { key, findings: [], checkedAt, model: MODEL };
  }

  // Run all scopes in parallel. Each scope is wrapped to fail-open
  // independently — one scope's failure does not block the others.
  const scopeResults =
    scopes.length > 0
      ? await Promise.all(
          scopes.map(async (scope) =>
            runScopeCall(spec, row.declared, ownerOriginal, substrateByInput, scope, key),
          ),
        )
      : [];

  const findings: ValidationFinding[] = [
    ...earlyFindings,
    ...scopeResults.flatMap((r) => r.findings),
  ];
  const errors = scopeResults.map((r) => r.error).filter((e): e is string => Boolean(e));
  const error = errors.length > 0 ? errors.join("; ") : undefined;

  return { key, findings, checkedAt, model: MODEL, ...(error ? { error } : {}) };
}

/**
 * Run one validator scope (either the lists call or a single prose call).
 * Each call is independent; failures here are caught and returned as
 * `findings: []` + `error` so the orchestrator can fail-open per scope.
 */
async function runScopeCall(
  spec: DescriptorSpec,
  declared: unknown,
  ownerOriginal: Record<string, unknown>,
  substrateByInput: Record<string, SubstrateCache>,
  scope: ValidatorScope,
  key: string,
): Promise<{ findings: ValidationFinding[]; error?: string }> {
  const prompt = buildValidatorPrompt(spec, declared, ownerOriginal, substrateByInput, scope);
  const label =
    scope.mode === "lists"
      ? `validateDescriptor[${key}::lists]`
      : `validateDescriptor[${key}::prose:${scope.proseKey}]`;
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    });
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const parsed = parseJsonStrict<{ findings: ValidationFinding[] }>(text, label);
    const findings: ValidationFinding[] = (parsed.findings ?? []).map((f) => {
      const rawExemplars = (f as { exemplars?: unknown }).exemplars;
      const exemplars: Exemplar[] | undefined = Array.isArray(rawExemplars)
        ? rawExemplars
            .map((e) => {
              if (!e || typeof e !== "object") return null;
              const obj = e as Record<string, unknown>;
              const content = typeof obj.content === "string" ? obj.content : "";
              if (content.trim().length === 0) return null;
              const source: ExemplarSource =
                obj.source === "existing"
                  ? "existing"
                  : obj.source === "rephrased"
                    ? "rephrased"
                    : "new";
              const fromSlot =
                (source === "existing" || source === "rephrased") &&
                typeof obj.fromSlot === "number"
                  ? obj.fromSlot
                  : undefined;
              return { content, source, ...(fromSlot !== undefined ? { fromSlot } : {}) };
            })
            .filter((e): e is Exemplar => e !== null)
        : undefined;
      return {
        inputKey: String(f.inputKey ?? ""),
        verdict: (["pass", "warn", "attention"] as const).includes(
          f.verdict as ValidationVerdict,
        )
          ? (f.verdict as ValidationVerdict)
          : "attention",
        reason: typeof f.reason === "string" ? f.reason : "",
        exemplars,
      };
    });
    return { findings };
  } catch (err) {
    return {
      findings: [],
      error: err instanceof Error ? err.message : "unknown validator error",
    };
  }
}

/**
 * Validate every descriptor in a brand that has declared content AND isn't
 * already validated against its current content. **Idempotency-by-content:**
 * any descriptor with existing findings is skipped — `setDeclared` drops
 * findings on every declared edit (stale-on-edit), so existence implies
 * "content unchanged since last validated." Descriptors with a prior fail-open
 * `error` are retried (that wasn't a real result).
 *
 * Cost shape: initial full check ~18 descriptors; iteration runs hit only the
 * descriptors the owner has just edited.
 */
export async function validateBrandIdentity(
  brandIdentityId: string,
): Promise<DescriptorValidationResult[]> {
  const rows = await sql`
    SELECT
      key,
      metadata->'validationFindings'->'findings' AS findings,
      metadata->'validationFindings'->>'error' AS error
    FROM brand_descriptor
    WHERE brand_identity_id = ${brandIdentityId}
      AND declared IS NOT NULL
      AND declared <> '""'::jsonb
      AND declared <> '{}'::jsonb
  `;

  const needsValidation = rows.filter((r) => {
    const findings = r.findings as unknown[] | null;
    if (!findings) return true; // never validated
    if (r.error) return true; // previous run was a fail-open; retry
    return false; // has findings — content unchanged since; skip
  });

  // Parallelize — ~18 descriptors at sequential Haiku latency = 30-90s wait;
  // concurrent brings it to 3-5s. Anthropic rate limits handle this fine for
  // ops-scale traffic.
  return Promise.all(
    needsValidation.map((r) => validateDescriptor(brandIdentityId, r.key as string)),
  );
}
