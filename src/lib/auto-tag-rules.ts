/**
 * Per-tag-group rules governing the auto-tag matching algorithm.
 *
 * LOCKED 2026-05-10. Different tag groups have meaningfully different
 * risk profiles for catalog-match noise and NER suggestion quality —
 * a single algorithm can't serve all 6 groups well. These rules are
 * the per-group knobs.
 *
 * See:
 *   memory/project_tracpost_auto_tag_inspector_design.md
 *
 * v1: hard-coded defaults. Operator-tunable per-business overrides
 * (DB table) can come later if real-world tuning need surfaces.
 */

export type TagGroup =
  | "brand"
  | "service"
  | "project"
  | "persona"
  | "branch";

export type AutoTagRules = {
  /** Skip catalog match if entity name is shorter than this many chars. */
  min_match_chars: number;
  /** Skip catalog match if entity name has fewer than this many words. */
  min_match_words: number;
  /** Use \b word-boundary regex (true) or raw substring (false). */
  word_boundary_required: boolean;
  /** If catalog match found, auto-link to asset_*_join (server-side, pre-checked pill). */
  allow_auto_link_existing: boolean;
  /** NER may surface new-entity candidates for subscriber confirmation. */
  allow_suggest_create_new: boolean;
  /** NER may CREATE + LINK new entities WITHOUT subscriber confirmation. Almost always N — too risky. */
  allow_auto_create_new: boolean;
  /** Keyword cue parser may surface new-entity candidates when subscriber
   *  uses a group-specific cue word ('project', 'service', etc.) near a
   *  capitalized name in the transcript. See keyword_cue_creation memory. */
  allow_keyword_create_new: boolean;
  /** Group-specific keyword vocabulary for the cue parser. Lowercase. */
  keyword_cues: string[];
};

export const AUTO_TAG_RULES: Record<TagGroup, AutoTagRules> = {
  brand: {
    min_match_chars: 3,
    min_match_words: 1,
    word_boundary_required: true,
    allow_auto_link_existing: true,
    // Sonnet NER for proper-noun brands (Thermador, Brizo) is the one
    // case where world-knowledge usefully proposes new entities.
    // NER surfaces TOP-LEVEL brand names (Sonnet consolidates product
    // variants into the parent brand). Sub-brand discovery is
    // explicitly subscriber-manual via /dashboard/tagging — see
    // memory/project_tracpost_brand_entity_granularity.md.
    allow_suggest_create_new: true,
    allow_auto_create_new: false,
    // Keyword cue creation DISABLED for brands (LOCKED 2026-05-11).
    // Sub-brand fragments (e.g. "Thermador refrigerator brand") would
    // create catalog noise. Subscribers add sub-brands manually when
    // they want that granularity. Vocabulary kept here so operator can
    // re-enable per-business via /dashboard/tagging Configure if a
    // specific use case warrants it.
    allow_keyword_create_new: false,
    keyword_cues: ["brand"],
  },
  service: {
    min_match_chars: 4,
    // Forces multi-word service names. Single-word ("Plumbing") is
    // too generic and produces noise from common transcript words.
    min_match_words: 2,
    word_boundary_required: true,
    allow_auto_link_existing: true,
    // Subscriber-defined; world-knowledge irrelevant for "Kitchen
    // remodel" vs "Custom kitchen design".
    allow_suggest_create_new: false,
    allow_auto_create_new: false,
    allow_keyword_create_new: true,
    keyword_cues: ["service"],
  },
  project: {
    min_match_chars: 5,
    // The load-bearing rule: distinguishes "Point Breeze kitchen
    // remodel" (legitimate project match) from "kitchen" (noise).
    min_match_words: 2,
    word_boundary_required: true,
    allow_auto_link_existing: true,
    allow_suggest_create_new: false,
    allow_auto_create_new: false,
    allow_keyword_create_new: true,
    keyword_cues: ["project"],
  },
  persona: {
    min_match_chars: 3,
    min_match_words: 1,
    word_boundary_required: true,
    allow_auto_link_existing: true,
    // Privacy-excluded — NER never surfaces person mentions.
    allow_suggest_create_new: false,
    allow_auto_create_new: false,
    // Keyword-cue creation IS allowed for personas — explicit subscriber
    // intent ("our client Mary Jones") satisfies the privacy concern
    // that motivated NER exclusion (subscriber is naming this person on
    // purpose; consent capture happens at confirmation step).
    allow_keyword_create_new: true,
    keyword_cues: ["client", "customer"],
  },
  branch: {
    min_match_chars: 3,
    min_match_words: 1,
    word_boundary_required: true,
    allow_auto_link_existing: true,
    // Operator-managed structural units; not extractable from world knowledge.
    allow_suggest_create_new: false,
    allow_auto_create_new: false,
    allow_keyword_create_new: true,
    keyword_cues: ["branch", "location", "office", "store"],
  },
};

/**
 * Per-site rule override (subset of AutoTagRules). Stored on
 * sites.tag_group_config.{group}.rules. Any field present overrides
 * the corresponding default; absent fields fall back to AUTO_TAG_RULES.
 */
export type AutoTagRulesOverride = Partial<AutoTagRules>;

/**
 * Merge per-site override on top of the locked defaults to produce
 * the effective ruleset for a group. Helper used by both the API
 * (parsing tag_group_config) and the catalog/keyword scanners.
 */
export function getEffectiveRules(
  group: TagGroup,
  override?: AutoTagRulesOverride,
): AutoTagRules {
  const defaults = AUTO_TAG_RULES[group];
  if (!override) return defaults;
  return {
    min_match_chars: override.min_match_chars ?? defaults.min_match_chars,
    min_match_words: override.min_match_words ?? defaults.min_match_words,
    word_boundary_required: override.word_boundary_required ?? defaults.word_boundary_required,
    allow_auto_link_existing: override.allow_auto_link_existing ?? defaults.allow_auto_link_existing,
    allow_suggest_create_new: override.allow_suggest_create_new ?? defaults.allow_suggest_create_new,
    allow_auto_create_new: override.allow_auto_create_new ?? defaults.allow_auto_create_new,
    allow_keyword_create_new: override.allow_keyword_create_new ?? defaults.allow_keyword_create_new,
    keyword_cues: override.keyword_cues && override.keyword_cues.length > 0
      ? override.keyword_cues
      : defaults.keyword_cues,
  };
}

/**
 * Normalize an entity name for matching. Handles:
 *  - Lowercase + trim + collapse whitespace (NBSPs/tabs → single space)
 *  - Smart punctuation → ASCII (curly quotes, em-dash → straight quotes/hyphen)
 *
 * Does NOT collapse "and" ↔ "&" — that's handled at match time by
 * fuzzyWordEqual() so & ↔ and treat as equivalent token-by-token.
 */
export function normalizeEntityName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")  // curly single → '
    .replace(/[“”]/g, '"')  // curly double → "
    .replace(/[–—]/g, "-")  // en/em dash → hyphen
    .replace(/\s+/g, " ")              // any whitespace runs → single space
    .trim();
}

/**
 * Levenshtein edit distance between two strings. O(n*m) time, O(n) space.
 * Bounded version: returns Infinity if distance exceeds maxDistance
 * (early exit for efficiency when we only care about small edits).
 */
function levenshtein(a: string, b: string, maxDistance = 1): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > maxDistance) return Infinity;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  // Single-row DP
  let prev: number[] = Array(b.length + 1).fill(0).map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr: number[] = [i];
    let minInRow = i;
    for (let j = 1; j <= b.length; j++) {
      if (a.charAt(i - 1) === b.charAt(j - 1)) {
        curr.push(prev[j - 1]);
      } else {
        curr.push(Math.min(prev[j - 1], curr[j - 1], prev[j]) + 1);
      }
      if (curr[j] < minInRow) minInRow = curr[j];
    }
    // Early exit if even the minimum value in this row exceeds budget
    if (minInRow > maxDistance) return Infinity;
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Word-level fuzzy equality. Handles:
 *  - Exact match (fast path)
 *  - "&" ↔ "and" (special equivalence)
 *  - Levenshtein ≤1 for words ≥4 chars (catches single-letter typos, plurals,
 *    Whisper spelling drift like Mitchell↔Mitchel)
 *  - Short words (<4 chars) require EXACT match (avoids false positives on
 *    common short words like "the"/"she", "and"/"end")
 */
function fuzzyWordEqual(a: string, b: string): boolean {
  if (a === b) return true;
  // & ↔ and equivalence
  if ((a === "&" && b === "and") || (a === "and" && b === "&")) return true;
  // Require both words ≥4 chars for fuzzy matching
  if (a.length < 4 || b.length < 4) return false;
  return levenshtein(a, b, 1) <= 1;
}

/**
 * Tokenize text into words with character-offset tracking. Used for
 * fuzzy match position recovery (so we can extract context_excerpt
 * around the matched span in the original transcript).
 *
 * Normalization: lowercase + strip punctuation (preserving "&" and
 * apostrophes which can carry semantic weight). NBSPs/tabs collapsed
 * to spaces via the same lowercase pipeline.
 */
type TokenWithPos = { word: string; start: number; end: number };

function tokenizeWithPositions(text: string): TokenWithPos[] {
  const tokens: TokenWithPos[] = [];
  // Build the normalized form to tokenize, but track positions in original
  const lower = text.toLowerCase();
  // Word is alphanumeric + apostrophe + hyphen + ampersand (treated as
  // a standalone token via its own regex group)
  const re = /[\w'-]+|&/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lower)) !== null) {
    tokens.push({
      word: m[0],
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return tokens;
}

/**
 * Find a sliding-window fuzzy match for `needle` token list inside
 * `haystack` token list. Returns the start/end position in the
 * haystack's tokens, or null if no match.
 *
 * Match rules:
 *  - Tokens must appear in order
 *  - Each token pair must pass fuzzyWordEqual
 *  - All needle tokens must match consecutively in haystack
 *
 * Used by both catalog scan (entity name in transcript) and NER fuzzy
 * dedup (existing entity name in NER-extracted candidate name).
 */
export function findFuzzyTokenSpan(
  haystack: TokenWithPos[],
  needleWords: string[],
): { startIdx: number; endIdx: number; charStart: number; charEnd: number } | null {
  if (needleWords.length === 0) return null;
  if (needleWords.length > haystack.length) return null;
  for (let start = 0; start <= haystack.length - needleWords.length; start++) {
    let allMatch = true;
    for (let i = 0; i < needleWords.length; i++) {
      if (!fuzzyWordEqual(haystack[start + i].word, needleWords[i])) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) {
      const endIdx = start + needleWords.length - 1;
      return {
        startIdx: start,
        endIdx,
        charStart: haystack[start].start,
        charEnd: haystack[endIdx].end,
      };
    }
  }
  return null;
}

/**
 * Tokenize an entity name into normalized word list (for fuzzy matching).
 */
export function tokenizeEntityName(name: string): string[] {
  return tokenizeWithPositions(normalizeEntityName(name)).map((t) => t.word);
}

/**
 * Check if an entity name passes the per-group rules for catalog
 * matching. Used by the inspector's catalog-scan loop to skip
 * entities that are ineligible (too short, too few words, or group
 * has auto-link disabled) before running the regex.
 */
export function entityNameEligibleForCatalogMatch(
  group: TagGroup,
  name: string,
  overrideRules?: AutoTagRulesOverride,
): boolean {
  const rules = getEffectiveRules(group, overrideRules);
  if (!rules.allow_auto_link_existing) return false;
  const trimmed = name.trim();
  if (trimmed.length < rules.min_match_chars) return false;
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < rules.min_match_words) return false;
  return true;
}

export type CatalogMatch = {
  entity_id: string;
  name: string;
  match_text: string;
  match_start: number;
  context_excerpt: string;
};

/**
 * Scan transcript for entity-name matches per the per-group rules.
 * Returns one hit per entity that matches (entities are not partially
 * matched — full-name regex). Each hit includes a context_excerpt
 * showing surrounding text for subscriber inspection.
 *
 * Cross-group matching is ADDITIVE — same transcript may yield hits
 * across multiple groups, and that's correct (the asset can be
 * legitimately described by descriptors from multiple groups).
 *
 * Caller is responsible for invoking once per group with that group's
 * entities.
 */
export function findCatalogMatches(
  transcript: string,
  group: TagGroup,
  entities: Array<{ id: string; name: string }>,
  overrideRules?: AutoTagRulesOverride,
): CatalogMatch[] {
  const rules = getEffectiveRules(group, overrideRules);
  void rules; // word_boundary_required is implicit in tokenization now
  const matches: CatalogMatch[] = [];

  // Tokenize transcript ONCE for the whole entity loop. Each token
  // carries its char position so we can recover context_excerpt from
  // the original transcript text.
  const transcriptTokens = tokenizeWithPositions(transcript);

  for (const entity of entities) {
    if (!entityNameEligibleForCatalogMatch(group, entity.name, overrideRules)) continue;

    // Tokenize entity name. Whitespace + smart-punctuation handled by
    // tokenizer; & ↔ and equivalence handled inside fuzzyWordEqual at
    // the per-token level. No need for variant generation anymore.
    const entityTokens = tokenizeEntityName(entity.name);
    if (entityTokens.length === 0) continue;

    const span = findFuzzyTokenSpan(transcriptTokens, entityTokens);

    if (!span) {
      // DEBUG: log misses for entities that LOOK like they should match
      // (entity name appears as substring of transcript via lowercase
      // compare). Helps diagnose silent normalization mismatches.
      const transcriptLower = transcript.toLowerCase();
      const normalizedName = normalizeEntityName(entity.name);
      if (transcriptLower.includes(normalizedName)) {
        console.warn(
          `[catalog-scan] MISS despite substring presence:`,
          {
            group,
            entityName: entity.name,
            normalized: normalizedName,
            entityTokens,
            transcriptSnippet: transcript.slice(0, 200),
          },
        );
      }
      continue;
    }

    {
      const ctxStart = Math.max(0, span.charStart - 30);
      const ctxEnd = Math.min(transcript.length, span.charEnd + 30);
      const ctx = transcript.slice(ctxStart, ctxEnd).trim();
      const ellipsisStart = ctxStart > 0 ? "…" : "";
      const ellipsisEnd = ctxEnd < transcript.length ? "…" : "";
      const matchText = transcript.slice(span.charStart, span.charEnd);

      matches.push({
        entity_id: entity.id,
        name: entity.name,
        match_text: matchText,
        match_start: span.charStart,
        context_excerpt: ellipsisStart + ctx + ellipsisEnd,
      });
    }
  }

  return matches;
}

export type KeywordCueCandidate = {
  /** Extracted name (run of capitalized words preceding the keyword). */
  name: string;
  /** The keyword that triggered extraction (e.g., "project"). */
  keyword: string;
  /** Group this candidate belongs to. */
  group: TagGroup;
  /** Surrounding transcript context for subscriber inspection. */
  context_excerpt: string;
};

/**
 * Walk backward from a keyword position to capture the run of
 * capitalized words that names the entity. Stops at lowercase
 * stop-word, sentence boundary, or no-capital-found.
 *
 * Per feedback_auto_tag_imperfection_tolerance.md: edge cases get
 * manual fallback. Don't try to handle every variant.
 */
const STOP_WORDS = new Set([
  "the", "a", "an", "our", "my", "your", "this", "that", "these", "those",
  "in", "on", "at", "for", "with", "from", "to", "of", "and", "or", "but",
  "amazing", "beautiful", "stunning", "incredible", "great", "awesome",
  "is", "was", "were", "are", "be", "been", "being",
  "completed", "finished", "ongoing", "active",
]);

function capitalizedRunBefore(words: string[], endIdx: number): string[] {
  const captured: string[] = [];
  for (let i = endIdx - 1; i >= 0; i--) {
    const w = words[i];
    const stripped = w.replace(/[^\w'-]/g, "");
    if (!stripped) break;
    if (STOP_WORDS.has(stripped.toLowerCase())) break;
    // Capitalized = first letter uppercase. Allow numbers/hyphens within.
    const firstCharUpper = /^[A-Z]/.test(stripped);
    if (!firstCharUpper) break;
    captured.unshift(stripped);
  }
  return captured;
}

/**
 * Scan transcript for keyword-cue patterns. Returns candidates of the
 * form `<capitalized name> <keyword>` for the given group.
 *
 * Example: "the Gibson Family Condo Transformation project" with
 * keyword "project" → candidate { name: "Gibson Family Condo
 * Transformation", keyword: "project", group: "project" }
 */
export function findKeywordCues(
  transcript: string,
  group: TagGroup,
  /** Optional per-site override of the keyword vocabulary. If provided
   *  and non-empty, REPLACES the default keyword_cues for this group.
   *  Sourced from sites.tag_group_config JSONB. */
  overrideCues?: string[],
  /** Optional per-site rule override. Honored alongside cues. */
  overrideRules?: AutoTagRulesOverride,
): KeywordCueCandidate[] {
  const rules = getEffectiveRules(group, overrideRules);
  if (!rules.allow_keyword_create_new) return [];
  const cues = (overrideCues && overrideCues.length > 0)
    ? overrideCues.map((c) => c.toLowerCase().trim()).filter(Boolean)
    : rules.keyword_cues;
  if (cues.length === 0) return [];

  const candidates: KeywordCueCandidate[] = [];
  const seenNames = new Set<string>();

  // Tokenize on whitespace, preserve punctuation in tokens for boundary
  // detection. Track absolute char positions for context excerpts.
  const words = transcript.split(/\s+/);

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    // Strip trailing punctuation for keyword comparison
    const wLower = w.toLowerCase().replace(/[^\w]/g, "");
    if (!cues.includes(wLower)) continue;

    const nameWords = capitalizedRunBefore(words, i);
    if (nameWords.length === 0) continue;

    const name = nameWords.join(" ");
    // Apply same min_match_chars/words rules as catalog scan
    if (name.length < rules.min_match_chars) continue;
    if (nameWords.length < rules.min_match_words) continue;

    if (seenNames.has(name.toLowerCase())) continue;
    seenNames.add(name.toLowerCase());

    // Build context excerpt — ~30 chars before name to ~30 chars after keyword
    const startWordIdx = Math.max(0, i - nameWords.length - 3);
    const endWordIdx = Math.min(words.length, i + 4);
    const context = words.slice(startWordIdx, endWordIdx).join(" ");

    candidates.push({
      name,
      keyword: wLower,
      group,
      context_excerpt: context,
    });
  }

  return candidates;
}
