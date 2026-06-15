/**
 * Generate orchestrator — Phase 1 (home page hero only).
 *
 * Flow:
 *  1. Load full input state (catalog + business_info + gbp_profile + assets)
 *  2. Capture snapshot for drift detection
 *  3. Build base system prompt + hero user prompt
 *  4. Call Sonnet 4.6 with tool-use forced to submit_hero_section
 *  5. Validate response with Zod; retry once on validation failure
 *  6. Compose page envelope; return (caller persists)
 */
import Anthropic from "@anthropic-ai/sdk";
import { loadInput } from "./load-input";
import { captureCatalogSnapshot } from "./catalog-snapshot";
import { buildBaseSystemPrompt } from "./prompt/base-system-prompt";
import { buildHeroUserPrompt } from "./prompt/hero-prompt";
import { HeroSectionSchema } from "./validate";
import type { GeneratorInput, HeroSection, PageContent } from "./types";

const MODEL = "claude-sonnet-4-6";
const PROMPT_VERSION = "website_hero_v1";
const SCHEMA_VERSION = "1.0";

export interface GenerateHomeHeroResult {
  business_id: string;
  snapshot_id: string;
  catalog_version: string;
  content: PageContent;
  model: string;
  prompt_version: string;
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// JSON Schema for the submit_hero_section tool. Mirrors HeroSectionSchema.
const SUBMIT_HERO_TOOL = {
  name: "submit_hero_section",
  description: "Submit the generated hero section for the homepage.",
  input_schema: {
    type: "object" as const,
    required: ["type", "tagline", "headline", "subhead", "primary_cta", "secondary_cta", "hero_image"],
    properties: {
      type: { type: "string", const: "hero" },
      tagline: { type: ["string", "null"] },
      headline: { type: "string", minLength: 1 },
      subhead: { type: ["string", "null"] },
      primary_cta: {
        type: "object",
        required: ["text", "href"],
        properties: {
          text: { type: "string", minLength: 1 },
          href: { type: "string", minLength: 1 },
        },
      },
      secondary_cta: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            required: ["text", "href"],
            properties: {
              text: { type: "string", minLength: 1 },
              href: { type: "string", minLength: 1 },
            },
          },
        ],
      },
      hero_image: {
        anyOf: [
          { type: "null" },
          {
            type: "object",
            required: ["asset_id", "url", "alt"],
            properties: {
              asset_id: { type: ["string", "null"] },
              url: { type: ["string", "null"] },
              alt: { type: "string", minLength: 1 },
            },
          },
        ],
      },
    },
  },
};

export async function generateHomePageHero(
  businessId: string,
): Promise<GenerateHomeHeroResult> {
  // ── 1. Load input ────────────────────────────────────────────────
  const input = await loadInput(businessId);

  // ── 2. Capture snapshot ─────────────────────────────────────────
  const snapshot = await captureCatalogSnapshot(input);

  // ── 3. Build prompts ────────────────────────────────────────────
  const systemPrompt = buildBaseSystemPrompt(input.catalog);
  const userPrompt = buildHeroUserPrompt(input);

  // ── 4. Call Sonnet with tool use ────────────────────────────────
  const heroSection = await callSonnetForHero(systemPrompt, userPrompt);

  // ── 5. Compose envelope ─────────────────────────────────────────
  const content: PageContent = {
    page_key: "home",
    schema_version: SCHEMA_VERSION,
    sections: [heroSection],
    metadata: {
      seo: {
        title: buildSeoTitle(input, heroSection),
        description: buildSeoDescription(input, heroSection),
        og_image_asset_id: null,
      },
      canonical_path: "/",
    },
  };

  return {
    business_id: businessId,
    snapshot_id: snapshot.snapshot_id,
    catalog_version: input.catalog.catalog_version,
    content,
    model: MODEL,
    prompt_version: PROMPT_VERSION,
  };
}

async function callSonnetForHero(
  systemPrompt: string,
  userPrompt: string,
  attempt: number = 0,
  priorError: string | null = null,
): Promise<HeroSection> {
  const userMessage =
    priorError !== null
      ? `${userPrompt}\n\nYour previous attempt failed validation: ${priorError}. Retry, ensuring the JSON conforms exactly to the tool schema.`
      : userPrompt;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt,
    tools: [SUBMIT_HERO_TOOL],
    tool_choice: { type: "tool", name: "submit_hero_section" },
    messages: [{ role: "user", content: userMessage }],
  });

  // Extract the tool use block from the response
  const toolUse = response.content.find(
    (block) => block.type === "tool_use" && block.name === "submit_hero_section",
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("website-gen: Sonnet did not invoke submit_hero_section tool");
  }

  // Validate against Zod schema
  const parsed = HeroSectionSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    if (attempt >= 1) {
      throw new Error(
        `website-gen: hero validation failed after retry. Issues: ${parsed.error.message}`,
      );
    }
    return callSonnetForHero(systemPrompt, userPrompt, attempt + 1, parsed.error.message);
  }
  return parsed.data;
}

function buildSeoTitle(input: GeneratorInput, hero: HeroSection): string {
  const name = input.business_info.name ?? "";
  const location = input.business_info.location ?? "";
  return `${name}${location ? ` | ${location}` : ""}`.slice(0, 60);
}

function buildSeoDescription(input: GeneratorInput, hero: HeroSection): string {
  if (hero.subhead) return hero.subhead.slice(0, 155);
  return hero.headline.slice(0, 155);
}
