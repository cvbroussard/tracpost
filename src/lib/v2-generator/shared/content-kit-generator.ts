import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";
import type { ContentKit } from "../types";

const anthropic = new Anthropic();
const MODEL = "claude-haiku-4-5-20251001";

/**
 * Generate the per-article content_kit (structured ingredients used by
 * platform slicers) from a generated article body.
 *
 * Each v2 article (blog, project chapter, service) calls this AFTER
 * persisting its body. The kit gets stored in the v2 row's content_kit
 * JSONB column. Compose + autopilot then slice it into per-platform
 * captions without further LLM cost.
 *
 * One Haiku call. Cheap (~$0.001 per article). Cached forever in the
 * row; re-runnable when Brand DNA evolves.
 */

export interface KitGenerateInput {
  siteId: string;
  title: string;
  body: string;
  excerpt: string;
  contentTags: string[];
}

export async function generateContentKit(input: KitGenerateInput): Promise<ContentKit> {
  // Pull DNA-derived brand context for voice continuity
  const [site] = await sql`
    SELECT name, url, brand_dna FROM businesses WHERE id = ${input.siteId}
  `;
  if (!site) throw new Error(`Site ${input.siteId} not found for content_kit generation`);
  const dna = (site.brand_dna || {}) as Record<string, unknown>;
  const playbook = (dna.playbook as BrandPlaybook | null) || null;
  const brandVoice = (dna.signals as Record<string, unknown> | null)?.voice as Record<string, unknown> || {};

  const prompt = buildKitPrompt({
    siteName: String(site.name || ""),
    siteUrl: String(site.url || ""),
    playbook,
    brandVoice,
    article: {
      title: input.title,
      body: input.body,
      excerpt: input.excerpt,
      contentTags: input.contentTags,
    },
  });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  return parseKit(text);
}

function buildKitPrompt(input: {
  siteName: string;
  siteUrl: string;
  playbook: BrandPlaybook | null;
  brandVoice: Record<string, unknown>;
  article: { title: string; body: string; excerpt: string; contentTags: string[] };
}): string {
  const parts: string[] = [];
  parts.push("You distill an article into structured ingredients. These ingredients feed a slicing system that composes social captions for every platform — short and long, casual and professional. Generate ingredients RICH enough that any platform's slicer can pull a great caption without further help.");
  parts.push("");
  parts.push("## Brand context");
  parts.push(`Site: ${input.siteName} (${input.siteUrl})`);
  if (input.playbook) {
    const angle = input.playbook.brandPositioning?.selectedAngles?.[0];
    if (angle) {
      parts.push(`Brand angle: "${angle.name}" — ${angle.tagline || ""}`);
      parts.push(`Tone: ${angle.tone || "engaging"}`);
    }
  }
  if (input.brandVoice.tone) parts.push(`Observed voice tone: ${input.brandVoice.tone}`);

  parts.push("");
  parts.push("## The article");
  parts.push(`Title: "${input.article.title}"`);
  parts.push(`Excerpt: ${input.article.excerpt}`);
  parts.push(`Tags: ${input.article.contentTags.join(", ")}`);
  parts.push("");
  parts.push("Body:");
  parts.push("```");
  parts.push(input.article.body.slice(0, 6000));
  parts.push("```");

  parts.push("");
  parts.push("## Response format");
  parts.push("Respond with ONLY a JSON object, no markdown fencing:");
  parts.push("```");
  parts.push(`{
  "hooks": ["...", "...", "..."],              // 4-6 punchy opening lines, ≤120 chars each, ranked strongest first
  "takeaways": ["...", "..."],                 // 4-6 single-sentence value props, ≤140 chars each
  "keyTerms": ["...", "..."],                  // 6-12 domain words / proper nouns / location markers
  "proofPoints": ["..."],                      // 3-5 specific facts, numbers, names that lend authority
  "inlineLinkContexts": ["...", "..."],        // 4-6 natural phrasings to introduce the URL ("see the full breakdown")
  "ctaVariants": {
    "short": ["..."],                          // 3-4 ultra-brief CTAs (≤25 chars)
    "medium": ["..."],                         // 3-4 medium CTAs (≤60 chars)
    "long": ["..."]                            // 2-3 longer CTAs (≤120 chars)
  },
  "voiceMarkers": {
    "signoffs": ["..."],
    "emojiPolicy": "none|sparse|frequent",
    "exclamationDensity": "low|medium|high",
    "casing": "sentence|title|lowercase"
  }
}`);
  parts.push("```");
  parts.push("");
  parts.push("Rules:");
  parts.push("- Hooks STOP THE SCROLL — every one must work as a first line");
  parts.push("- Takeaways are stand-alone — readable without context");
  parts.push("- Use language that appears in the article — don't substitute");
  parts.push("- Voice markers describe the article's actual register");

  return parts.join("\n");
}

function parseKit(text: string): ContentKit {
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const fallback: ContentKit = {
    hooks: [],
    takeaways: [],
    keyTerms: [],
    proofPoints: [],
    inlineLinkContexts: ["Read more"],
    ctaVariants: { short: [], medium: [], long: [] },
    voiceMarkers: {
      signoffs: [],
      emojiPolicy: "sparse",
      exclamationDensity: "low",
      casing: "sentence",
    },
  };
  try {
    const parsed = JSON.parse(cleaned);
    return {
      hooks: arrStr(parsed.hooks),
      takeaways: arrStr(parsed.takeaways),
      keyTerms: arrStr(parsed.keyTerms),
      proofPoints: arrStr(parsed.proofPoints),
      inlineLinkContexts: arrStr(parsed.inlineLinkContexts).length
        ? arrStr(parsed.inlineLinkContexts)
        : fallback.inlineLinkContexts,
      ctaVariants: {
        short: arrStr(parsed.ctaVariants?.short),
        medium: arrStr(parsed.ctaVariants?.medium),
        long: arrStr(parsed.ctaVariants?.long),
      },
      voiceMarkers: {
        signoffs: arrStr(parsed.voiceMarkers?.signoffs),
        emojiPolicy: enumOf(parsed.voiceMarkers?.emojiPolicy, ["none", "sparse", "frequent"], "sparse"),
        exclamationDensity: enumOf(parsed.voiceMarkers?.exclamationDensity, ["low", "medium", "high"], "low"),
        casing: enumOf(parsed.voiceMarkers?.casing, ["sentence", "title", "lowercase"], "sentence"),
      },
    };
  } catch {
    return fallback;
  }
}

function arrStr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

function enumOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}
