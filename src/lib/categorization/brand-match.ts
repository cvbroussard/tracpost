/**
 * Brand matcher — maps Stage 1 NER brand candidates to the site's brand
 * catalog.
 *
 * Lifted from the proven /api/auto-tag-suggest logic (see project_tracpost
 * _auto_tag_inspector_design memory + #215 Levenshtein fuzzy). Vision-based
 * brand "detection" was retired from the cascade because it hallucinated
 * matches from the catalog payload (Montigo @ 12% was the canary); brands
 * now only land on assets when the subscriber actually said the name and
 * NER caught it.
 *
 * The match path:
 *   1. For each NER brand candidate, fuzzy-token-match (forward + reverse)
 *      against every catalog brand. Longest catalog name wins.
 *   2. Slug-equality fallback catches normalization edge cases.
 *   3. Unmatched NER candidates become suggested_new (subscriber/operator
 *      can promote them — the existing POST /api/brands path enriches).
 */
import "server-only";
import { sql } from "@/lib/db";
import { tokenizeEntityName, findFuzzyTokenSpan } from "@/lib/auto-tag-rules";

export interface NerBrandCandidate {
  /** Surface form as extracted by NER (e.g. "Marvin"). */
  name: string;
  /** Sentence-level excerpt for evidence display. */
  context?: string;
}

export interface BrandCatalogMatch {
  brand_id: string;
  /** Catalog name (canonical). */
  name: string;
  /** What NER said before matching to the catalog. */
  ner_text: string;
  context: string;
}

export interface SuggestedNewBrand {
  name: string;
  slug: string;
  context: string;
}

export interface BrandMatchResult {
  matched: BrandCatalogMatch[];
  suggested_new: SuggestedNewBrand[];
}

function slugifyName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

export async function matchBrandsFromNer(
  siteId: string,
  nerBrands: NerBrandCandidate[],
): Promise<BrandMatchResult> {
  const matched: BrandCatalogMatch[] = [];
  const suggested_new: SuggestedNewBrand[] = [];
  if (nerBrands.length === 0) return { matched, suggested_new };

  const brandRows = await sql`
    SELECT id, name FROM brands WHERE business_id = ${siteId}
  `;
  const catalogIndex = brandRows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    tokens: tokenizeEntityName(r.name as string),
  }));

  const claimedBrandIds = new Set<string>();
  const seenSuggestedLower = new Set<string>();

  for (const ner of nerBrands) {
    const candidateTokens = tokenizeEntityName(ner.name).map((word, i) => ({
      word,
      start: i,
      end: i + 1,
    }));

    // Forward + reverse fuzzy-token match against each catalog entry.
    // Longest catalog name wins (stabilizes when "Mit" and "Mitchell"
    // both qualify).
    let best: { id: string; name: string; matchLen: number } | null = null;
    for (const entry of catalogIndex) {
      if (entry.tokens.length === 0) continue;
      const forward = findFuzzyTokenSpan(candidateTokens, entry.tokens);
      const candidateAsTokens = candidateTokens.map((t) => t.word);
      const reverseHaystack = entry.tokens.map((word, i) => ({
        word,
        start: i,
        end: i + 1,
      }));
      const reverse = findFuzzyTokenSpan(reverseHaystack, candidateAsTokens);
      if (forward || reverse) {
        const matchLen = entry.tokens.join(" ").length;
        if (!best || matchLen > best.matchLen) {
          best = { id: entry.id, name: entry.name, matchLen };
        }
      }
    }

    if (best) {
      if (!claimedBrandIds.has(best.id)) {
        matched.push({
          brand_id: best.id,
          name: best.name,
          ner_text: ner.name,
          context: ner.context || "",
        });
        claimedBrandIds.add(best.id);
      }
      continue;
    }

    // Slug-equality fallback (whitespace/punctuation drift the fuzzy
    // matcher wouldn't catch)
    const slug = slugifyName(ner.name);
    const slugHit = catalogIndex.find((e) => slugifyName(e.name) === slug);
    if (slugHit) {
      if (!claimedBrandIds.has(slugHit.id)) {
        matched.push({
          brand_id: slugHit.id,
          name: slugHit.name,
          ner_text: ner.name,
          context: ner.context || "",
        });
        claimedBrandIds.add(slugHit.id);
      }
      continue;
    }

    // No catalog hit → suggest as new brand. Dedup by lowercase name.
    const lower = ner.name.toLowerCase();
    if (seenSuggestedLower.has(lower)) continue;
    seenSuggestedLower.add(lower);
    suggested_new.push({
      name: ner.name,
      slug,
      context: ner.context || "",
    });
  }

  return { matched, suggested_new };
}
