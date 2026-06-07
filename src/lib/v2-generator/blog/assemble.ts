import { sql } from "@/lib/db";
import { getBrandPlaybookFromDescriptor } from "@/lib/brand-identity/playbook-from-descriptor";
import {
  pullHook,
  getHookBankDepth,
  getExistingTitles,
  getVendorLinks,
  getProjectLinks,
  buildAssetContexts,
  researchAssetContext,
  getModelConfig,
  FALLBACK_MODEL,
  FALLBACK_MAX_TOKENS,
} from "../shared";
import type { ModelConfig, AssetContext } from "../shared";
import { classifyBlogContentType } from "./classify";
import { buildBlogBodyPrompt } from "./prompts";
import type { BlogGenerateSpec, BlogContentType } from "./types";

/**
 * Assembled blog prompt — what the generator hands to the LLM.
 *
 * Used by both the full generator (which calls the LLM next) and the
 * dry-run inspector (which stops here for prompt-engineering review).
 */
export interface AssembledBlogPrompt {
  spec: BlogGenerateSpec;
  contentType: BlogContentType;
  modelConfig: ModelConfig;
  /** Whether the LLM call would use Sonnet (playbook present) or Haiku fallback. */
  useSonnet: boolean;
  /** What model + max_tokens would actually be sent to the API. */
  effectiveModel: string;
  effectiveMaxTokens: number;

  /** Structured inputs that fed the prompt — surfaced for inspectors. */
  inputs: {
    siteName: string;
    siteUrl: string;
    playbookPresent: boolean;
    brandAngle: string | null;
    brandTone: string | null;
    voiceTone: string | null;
    voiceLengthPattern: string | null;
    voiceCasing: string | null;
    voiceEmojiPolicy: string | null;
    voiceDistinctiveTraitCount: number;
    hookText: string | null;
    hookBankDepth: number;
    researchChars: number;
    vendorLinks: string[];
    projectLinks: string[];
    existingTitleCount: number;
    assets: AssetContext[];
  };

  /** The fully-assembled prompt string. */
  prompt: string;
  /** Stats on the assembled prompt. */
  promptStats: {
    chars: number;
    estimatedTokens: number;
    lines: number;
    blocks: Array<{ name: string; chars: number; lines: number }>;
  };
}

/**
 * Run the full pre-LLM assembly pipeline. Identical to what
 * generateBlogArticle does up through prompt construction, but stops
 * before the LLM call.
 *
 * generateBlogArticle calls this internally and then proceeds to call
 * the LLM. Inspectors call this directly to review the prompt without
 * paying for a generation.
 */
export async function assembleBlogPrompt(spec: BlogGenerateSpec): Promise<AssembledBlogPrompt> {
  // 1. Site context — playbook synthesized from brand_descriptor catalog
  // per Phase B retirement. signals.voice has no catalog equivalent today
  // (Phase B gap); empty until observed-voice substrate pipeline lands.
  const [site] = await sql`
    SELECT name, url FROM businesses WHERE id = ${spec.siteId}
  `;
  if (!site) throw new Error(`Site ${spec.siteId} not found`);
  const siteName = String(site.name || "");
  const siteUrl = String(site.url || "");
  const playbook = await getBrandPlaybookFromDescriptor(spec.siteId);
  const brandVoice: Record<string, unknown> = {};

  // 2. Resolve assets
  const assetIds = [spec.heroAssetId, ...(spec.bodyAssetIds || [])].filter(
    (id, i, arr) => arr.indexOf(id) === i,
  );
  const assets = await buildAssetContexts(assetIds, spec.heroAssetId, spec.siteId);
  if (assets.length === 0) throw new Error(`No usable assets resolved for spec`);

  const heroAsset = assets.find((a) => a.isHero) || assets[0];

  // 3. Parallel context gathering
  const [hookText, hookBankDepth, existingTitles, vendorData, research, projectLinks] = await Promise.all([
    pullHook(spec.siteId, { dryRun: spec.dryRun }),
    getHookBankDepth(spec.siteId),
    getExistingTitles(spec.siteId, "blog"),
    getVendorLinks(spec.heroAssetId),
    researchAssetContext(heroAsset.contextNote || ""),
    getProjectLinks(spec.siteId, siteUrl, { excludeProjectId: spec.projectId }),
  ]);

  // 4. Classify content type
  const contentType: BlogContentType = spec.contentTypeOverride
    || await classifyBlogContentType(spec.siteId, heroAsset.contextNote || "", research);

  const cfg = getModelConfig(contentType);
  const useSonnet = Boolean(playbook);

  // 5. Build prompt
  const prompt = buildBlogBodyPrompt({
    contentType,
    siteName,
    siteUrl,
    playbook,
    brandVoice,
    intent: spec.intent || null,
    topicHint: spec.topicHint || null,
    hookText,
    research,
    vendorLinks: vendorData.formatted,
    projectLinks,
    existingTitles,
    assets,
  });

  return {
    spec,
    contentType,
    modelConfig: cfg,
    useSonnet,
    effectiveModel: useSonnet ? cfg.model : FALLBACK_MODEL,
    effectiveMaxTokens: useSonnet ? cfg.maxTokens : FALLBACK_MAX_TOKENS,
    inputs: {
      siteName,
      siteUrl,
      playbookPresent: Boolean(playbook),
      brandAngle: (playbook?.brandPositioning?.selectedAngles?.[0]?.name as string) || null,
      brandTone: (playbook?.brandPositioning?.selectedAngles?.[0]?.tone as string) || null,
      voiceTone: (brandVoice.tone as string) || null,
      voiceLengthPattern: (brandVoice.length_pattern as string) || null,
      voiceCasing: (brandVoice.casing as string) || null,
      voiceEmojiPolicy: (brandVoice.emoji_use as string) || null,
      voiceDistinctiveTraitCount: Array.isArray(brandVoice.distinctive_traits)
        ? (brandVoice.distinctive_traits as string[]).length
        : 0,
      hookText,
      hookBankDepth,
      researchChars: research.length,
      vendorLinks: vendorData.formatted,
      projectLinks,
      existingTitleCount: existingTitles.length,
      assets,
    },
    prompt,
    promptStats: computeStats(prompt),
  };
}

/**
 * Walk the prompt + extract block-by-block stats. Each `## Heading`
 * starts a new block. Roughly 4 chars per token (English text).
 */
function computeStats(prompt: string): AssembledBlogPrompt["promptStats"] {
  const lines = prompt.split("\n");
  const blocks: Array<{ name: string; chars: number; lines: number }> = [];

  let currentName = "Preamble";
  let currentChars = 0;
  let currentLines = 0;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      // Flush current block
      if (currentLines > 0 || currentChars > 0) {
        blocks.push({ name: currentName, chars: currentChars, lines: currentLines });
      }
      currentName = line.slice(3).trim();
      currentChars = 0;
      currentLines = 0;
    } else {
      currentChars += line.length + 1; // +1 for newline
      currentLines += 1;
    }
  }
  // Flush final block
  if (currentLines > 0 || currentChars > 0) {
    blocks.push({ name: currentName, chars: currentChars, lines: currentLines });
  }

  return {
    chars: prompt.length,
    estimatedTokens: Math.ceil(prompt.length / 4),
    lines: lines.length,
    blocks,
  };
}
