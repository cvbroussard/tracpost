/**
 * OpenAI STT prompt builder — site-aware vocabulary + instructions.
 *
 * gpt-4o-transcribe (our default model as of 2026-05-18) accepts the
 * `prompt` parameter as natural-language instructions, not just a
 * vocabulary list. We use that capability to:
 *   1. Frame the audio domain (construction industry narration)
 *   2. Surface known proper nouns from the site catalog so the model
 *      treats them as coherent tokens (the Infratech → "Infratec"
 *      failure mode)
 *   3. Dictate output formatting (digits for years, preserve caps)
 *
 * The same prompt is also accepted by whisper-1 (fallback path for
 * voice-over recordings that need time-anchored segments). whisper-1
 * uses it as vocabulary biasing only — it ignores the instruction
 * sentences. Either way the prompt is useful; nothing breaks if we
 * route to whisper-1.
 *
 * Per project_tracpost_asset_analysis_cascade — STT is the ceiling
 * for the whole cascade.
 */
import "server-only";
import { sql } from "@/lib/db";

/** Whisper documents a 224-token prompt limit. Tokens average ~4 chars
 * in English so ~900 chars is the effective ceiling. We aim under to
 * leave room for the short intro phrase. gpt-4o-transcribe likely has
 * a similar limit (undocumented). Tested 2026-05-18: a 1394-char
 * prompt failed to bias alphabetically-late brands (e.g. "Tile and
 * Design" lost capitalization) — strong signal that the tail was
 * being truncated before reaching the model. */
const PROMPT_CHAR_BUDGET = 850;

/** Returns an OpenAI STT prompt biased toward the site's catalog
 * vocabulary, or empty string when the site has no catalog yet. */
export async function buildTranscriptionPromptForSite(siteId: string): Promise<string> {
  if (!siteId) return "";

  const [brandRows, projectRows, siteRow, categoryRows, personaRows] = await Promise.all([
    sql`SELECT name FROM brands WHERE site_id = ${siteId} ORDER BY name`,
    sql`SELECT name FROM projects WHERE site_id = ${siteId} ORDER BY name`,
    sql`SELECT gbp_profile->'serviceArea'->'places'->'placeInfos' AS place_infos
        FROM sites WHERE id = ${siteId}`,
    sql`SELECT gc.name FROM site_gbp_categories sgc
        JOIN gbp_categories gc ON gc.gcid = sgc.gcid
        WHERE sgc.site_id = ${siteId}
        ORDER BY sgc.is_primary DESC, gc.name`,
    sql`SELECT name FROM personas WHERE site_id = ${siteId}`,
  ]);

  const brands = brandRows.map((r) => r.name as string).filter(Boolean);
  const projects = projectRows.map((r) => r.name as string).filter(Boolean);
  const placeInfos = (siteRow[0]?.place_infos || []) as Array<{ placeName?: string }>;
  const serviceAreas = placeInfos
    .map((p) => (p.placeName || "").split(",")[0]?.trim())
    .filter((s): s is string => Boolean(s && s.length > 0));
  const categories = categoryRows.map((r) => r.name as string).filter(Boolean);
  const personas = personaRows.map((r) => r.name as string).filter(Boolean);

  // Dedupe across groups (project might be named after a neighborhood).
  const seen = new Set<string>();
  function add(into: string[], from: string[]) {
    for (const name of from) {
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      into.push(name);
    }
  }
  const brandsList: string[] = [];
  const projectsList: string[] = [];
  const placesList: string[] = [];
  const categoriesList: string[] = [];
  const personasList: string[] = [];
  add(brandsList, brands);
  add(projectsList, projects);
  add(placesList, serviceAreas);
  add(categoriesList, categories);
  add(personasList, personas);

  // Priority-ordered single list (2026-05-18 retest). Earlier prompt
  // shape had instruction sentences + per-group headers that ate
  // ~400 chars without earning their keep — gpt-4o-transcribe ignored
  // the instructions, and the alphabetically-late brands fell off
  // the model's effective window. New shape: minimal intro + tight
  // priority-ordered list, capped at PROMPT_CHAR_BUDGET.
  //
  // Order:
  //   1. brands — highest stakes for attribution + most common fail
  //   2. projects — subscriber-specific, never in model training
  //   3. service areas — local geography, often mis-heard
  //   4. categories — occupational jargon, mostly in model training
  //   5. personas — people names, mostly in model training
  // Within each group: as collected (caller order preserved).
  const ordered = [
    ...brandsList,
    ...projectsList,
    ...placesList,
    ...categoriesList,
    ...personasList,
  ];
  if (ordered.length === 0) return "";

  // "Names in this audio:" is the shortest framing that signals to
  // the model "these are vocabulary biases" without burning chars on
  // instructions that aren't honored anyway.
  const intro = "Names in this audio: ";
  let prompt = intro;
  for (const name of ordered) {
    const sep = prompt.length === intro.length ? "" : ", ";
    const next = `${sep}${name}`;
    if (prompt.length + next.length > PROMPT_CHAR_BUDGET) break;
    prompt += next;
  }
  return prompt;
}

// Back-compat alias — existing callers may still import the old name.
// New code should use buildTranscriptionPromptForSite directly.
export const buildWhisperPromptForSite = buildTranscriptionPromptForSite;

/**
 * Post-transcription case normalization. Walks the site's catalog and
 * does word-boundary case-insensitive replacement in the transcript,
 * substituting each catalog entry's canonical casing.
 *
 * Solves the gpt-4o-transcribe case-drift problem: vocabulary priming
 * fixes spelling (e.g. "infratech" with the h) but the model normalizes
 * capitalization on its own. This layer re-asserts catalog casing
 * deterministically — "infratech" → "Infratech", "tile and design"
 * → "Tile and Design", etc.
 *
 * Properties:
 *   - Deterministic, no LLM, runs in ~1ms
 *   - Word-boundary safe (\b) — "brick" inside "Bricklaying" untouched
 *     if "Brick" is a brand
 *   - Multi-word safe — "Tile and Design" matched as a single phrase
 *   - Idempotent — running twice produces the same result
 *   - Conservative — only re-cases tokens we have catalog evidence for
 *
 * Doesn't fix: brands not yet in catalog (suggested_new lands with raw
 * model casing), non-catalog proper nouns (e.g. architectural styles
 * like "Tudor" — separate acoustic problem, not a casing problem).
 */
export async function normalizeTranscriptCase(text: string, siteId: string): Promise<string> {
  if (!text || !siteId) return text;

  const [brandRows, projectRows, siteRow, categoryRows, personaRows] = await Promise.all([
    sql`SELECT name FROM brands WHERE site_id = ${siteId}`,
    sql`SELECT name FROM projects WHERE site_id = ${siteId}`,
    sql`SELECT gbp_profile->'serviceArea'->'places'->'placeInfos' AS place_infos
        FROM sites WHERE id = ${siteId}`,
    sql`SELECT gc.name FROM site_gbp_categories sgc
        JOIN gbp_categories gc ON gc.gcid = sgc.gcid
        WHERE sgc.site_id = ${siteId}`,
    sql`SELECT name FROM personas WHERE site_id = ${siteId}`,
  ]);

  const brands = brandRows.map((r) => r.name as string).filter(Boolean);
  const projects = projectRows.map((r) => r.name as string).filter(Boolean);
  const placeInfos = (siteRow[0]?.place_infos || []) as Array<{ placeName?: string }>;
  const serviceAreas = placeInfos
    .map((p) => (p.placeName || "").split(",")[0]?.trim())
    .filter((s): s is string => Boolean(s && s.length > 0));
  const categories = categoryRows.map((r) => r.name as string).filter(Boolean);
  const personas = personaRows.map((r) => r.name as string).filter(Boolean);

  // Dedupe across groups (a project name might overlap with a brand).
  // Then sort longest-first so multi-word phrases get matched before
  // their constituent words (defensive — \b matching handles most
  // cases but ordering removes ambiguity).
  const seen = new Set<string>();
  const canonical: string[] = [];
  for (const name of [...brands, ...projects, ...serviceAreas, ...categories, ...personas]) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    canonical.push(name);
  }
  canonical.sort((a, b) => b.length - a.length);

  let out = text;
  for (const name of canonical) {
    // For each catalog entry, generate both & and "and" variants so
    // we catch the transcription model's tendency to expand "&" to
    // "and" (people say "and" aloud regardless of how the brand is
    // written). E.g. catalog "Tile & Design" also matches "tile
    // and design" in the transcript. Both get re-cased to the
    // canonical form. Same pattern brand-match.ts uses for fuzzy
    // matching — applied to the case normalizer too.
    for (const variant of expandAmpAndVariants(name)) {
      // Escape regex special chars (parens, dots, ampersand isn't
      // special but doesn't hurt). Then wrap in word boundaries +
      // case-insensitive flag. Replacement is always the canonical
      // catalog form.
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`\\b${escaped}\\b`, "gi");
      out = out.replace(re, name);
    }
  }
  return out;
}

/** Returns the catalog name plus a variant with & ↔ and swapped,
 * if either token is present. Lets the normalizer match transcripts
 * where the model expanded "&" to "and" (or, less commonly, the
 * reverse). Word-boundary " and " / " & " only — avoids hitting
 * partial words like "Sandwich". */
function expandAmpAndVariants(name: string): string[] {
  const variants = new Set<string>([name]);
  if (name.includes(" & ")) {
    variants.add(name.replace(/ & /g, " and "));
  }
  if (/ and /i.test(name)) {
    variants.add(name.replace(/ and /gi, " & "));
  }
  return Array.from(variants);
}
