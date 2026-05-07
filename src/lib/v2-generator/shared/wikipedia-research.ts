/**
 * Wikipedia research — extract named entities from a context note,
 * fetch Wikipedia summaries, return formatted research blocks.
 *
 * Ported from v1 (`src/lib/research/wikipedia.ts` researchContextNote)
 * with two changes:
 *   1. Editorial image generation is REMOVED — deferred to v2.1 pending
 *      AI-asset tagging fix (#139). v2.0 articles use only existing
 *      subscriber + library assets in body, no generated illustrations.
 *   2. Result shape simplified — just text blocks, no editorialImages
 *      array.
 *
 * The text output is fed into the prompt as
 *   "## Background Research (from Wikipedia)\n${research}"
 *
 * This is what gives v1 articles their factual grounding — vendor and
 * material names get real history/origin/craft context the LLM can weave
 * in instead of generic prose.
 */

import { extractResearchTerms, lookupWikipedia } from "@/lib/research/wikipedia";

export async function researchAssetContext(contextNote: string): Promise<string> {
  if (!contextNote || contextNote.length < 10) return "";

  const terms = await extractResearchTerms(contextNote);
  if (terms.length === 0) return "";

  const results: string[] = [];
  for (const term of terms) {
    const summary = await lookupWikipedia(term);
    if (summary) {
      results.push(`**${summary.title}**: ${summary.extract}`);
    }
  }

  return results.join("\n\n");
}
