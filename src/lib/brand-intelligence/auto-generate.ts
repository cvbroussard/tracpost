/**
 * Auto-generate a full brand playbook from business type + location.
 * No subscriber input needed — Claude researches everything independently.
 *
 * Called automatically after site creation during onboarding.
 */
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type {
  BrandPlaybook,
  AudienceResearch,
  BrandAngle,
  ContentHook,
  OfferCore,
} from "./types";

const anthropic = new Anthropic();

/**
 * Generate a complete brand playbook from minimal input.
 * Stores playbook, populates hook_bank (50 hooks), generates content_topics (40).
 */
export async function autoGeneratePlaybook(
  siteId: string,
  businessType: string,
  location?: string,
  websiteUrl?: string
): Promise<BrandPlaybook> {
  const locationStr = location || "nationwide";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16384,
    messages: [
      {
        role: "user",
        content: `You are a brand strategist and audience researcher. Generate a comprehensive brand playbook for a **${businessType}** business${location ? ` in **${locationStr}**` : ""}.
${websiteUrl ? `Their website: ${websiteUrl}` : ""}

Research this business category deeply. Use your knowledge of the market, audience psychology, competitive landscape, and content strategy to produce the following JSON structure.

Respond with ONLY valid JSON (no markdown fencing):
{
  "audienceResearch": {
    "transformationJourney": {
      "currentState": "<where the target customer is now — their frustrations, situation, daily reality. 2-3 sentences>",
      "desiredState": "<where they want to be — the outcome they dream about. 2-3 sentences>"
    },
    "urgencyGateway": {
      "problem": "<the core problem that makes them search for this service>",
      "whyUrgent": "<why they can't wait — the tipping point>",
      "failedSolutions": ["<3-5 things they've already tried that didn't work>"],
      "aspirinSolution": "<what they wish existed — the ideal solution>"
    },
    "painPoints": [
      {"pain": "<specific pain>", "severity": "critical|moderate|low", "emotionalContext": "<how it makes them feel>", "realQuotes": ["<2-3 things they'd actually say about this pain>"]}
    ],
    "languageMap": {
      "painPhrases": ["<8-10 exact phrases they use when describing their problem>"],
      "desirePhrases": ["<8-10 exact phrases they use when describing what they want>"],
      "searchPhrases": ["<8-10 search queries they type into Google or TikTok>"],
      "emotionalTriggers": ["<6-8 emotional triggers that drive action>"]
    },
    "congregationPoints": [
      {"platform": "reddit|youtube|facebook|instagram|tiktok", "name": "<specific community/channel>", "detail": "<why it matters>"}
    ],
    "competitiveLandscape": {
      "existingSolutions": [
        {"name": "<competitor or alternative>", "positioning": "<how they position>", "complaints": ["<what customers complain about>"]}
      ],
      "marketGaps": ["<3-4 opportunities competitors are missing>"],
      "positioningOpportunities": ["<3-4 ways to differentiate>"]
    }
  },
  "brandPositioning": {
    "selectedAngles": [
      {
        "name": "<angle name>",
        "tagline": "<one-line positioning statement>",
        "targetPain": "<which pain this addresses>",
        "targetDesire": "<which desire this fulfills>",
        "tone": "<voice description>",
        "contentThemes": ["<4-6 content themes>"]
      }
    ]
  },
  "contentHooks": {
    "lovedHooks": [
      {"text": "<scroll-stopping hook>", "category": "pain_agitation|contrarian|curiosity|identity|authority|transformation"}
    ],
    "likedHooks": [],
    "totalRated": 50,
    "summary": {"loved": 50, "liked": 0, "skipped": 0}
  },
  "offerCore": {
    "offerStatement": {
      "finalStatement": "<the core promise — one powerful sentence>",
      "emotionalCore": "<the emotional truth behind the offer>",
      "universalMotivatorsUsed": ["<2-3 universal motivators>"]
    },
    "benefits": ["<5-7 specific benefits>"],
    "useCases": ["<4-6 use cases / scenarios>"],
    "hiddenBenefits": ["<3-4 unexpected benefits>"],
    "programNameOptions": [
      {"name": "<brand program name>", "uniqueMechanism": "<what makes it unique>", "rationale": "<why this name works>"}
    ]
  }
}

Requirements:
- Generate 5 pain points with real-sounding quotes
- Generate 3 brand angles (the first should be the strongest)
- Generate 50 content hooks spread across all 6 categories (put all in lovedHooks)
- Generate 3 competitors in the competitive landscape
- All language should sound like real people talking, not marketing copy
- Search phrases should be actual queries people type
- Be specific to ${businessType}${location ? ` in ${locationStr}` : ""} — not generic`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const playbook = JSON.parse(cleaned) as BrandPlaybook;
  playbook.generatedAt = new Date().toISOString();
  playbook.version = "2.0-auto";

  // Store playbook on site
  await sql`
    UPDATE sites
    SET brand_playbook = ${JSON.stringify(playbook)},
        brand_wizard_state = NULL,
        updated_at = NOW()
    WHERE id = ${siteId}
  `;

  // Populate hook_bank with all 50 hooks
  const hooks = playbook.contentHooks.lovedHooks || [];
  for (const hook of hooks) {
    await sql`
      INSERT INTO hook_bank (site_id, text, category, rating)
      VALUES (${siteId}, ${hook.text}, ${hook.category}, 'loved')
      ON CONFLICT DO NOTHING
    `;
  }

  // Backfill brand_voice for legacy consumers
  const angle = playbook.brandPositioning.selectedAngles[0];
  const brandVoice = {
    tone: angle?.tone || "",
    keywords: playbook.audienceResearch.languageMap.desirePhrases.slice(0, 10),
    avoid: [],
    _source: "auto_generate_v2",
  };

  await sql`
    UPDATE sites
    SET brand_voice = ${JSON.stringify(brandVoice)}, updated_at = NOW()
    WHERE id = ${siteId}
  `;

  // Content topics and pillar config are NOT generated from the baseline.
  // They are generated after the subscriber sharpens the playbook in refinePlaybook().

  return playbook;
}

/**
 * Refine an existing playbook with the subscriber's unique angle.
 * Takes the baseline playbook and reshapes audience, positioning,
 * hooks, and offer around the subscriber's differentiator.
 */
export async function refinePlaybook(
  siteId: string,
  angle: string
): Promise<BrandPlaybook> {
  // Load existing playbook
  const [site] = await sql`
    SELECT brand_playbook, business_type, location FROM sites WHERE id = ${siteId}
  `;

  if (!site?.brand_playbook) {
    throw new Error("No existing playbook to refine");
  }

  const existing = site.brand_playbook as unknown as BrandPlaybook;
  const businessType = (site.business_type as string) || "business";
  const location = (site.location as string) || "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16384,
    messages: [
      {
        role: "user",
        content: `You are a brand strategist. I have a baseline brand playbook for a **${businessType}** in **${location}**. The owner has shared their unique angle — their differentiator that separates them from every other ${businessType}.

## The Owner's Angle
"${angle}"

## Existing Baseline Playbook
${JSON.stringify(existing, null, 2)}

## Your Task
Regenerate the playbook, reshaping it through the lens of the owner's unique angle. This is not a generic ${businessType} anymore.

**PRESERVE from baseline** (this research is still valid):
- Competitive landscape (existing solutions, market gaps) — update positioning opportunities to reflect the angle
- Congregation points (where the audience hangs out) — narrow to the angle's specific audience
- Urgency gateway structure — rewrite the problem/urgency through the angle's lens

**RESHAPE around the angle**:
- **Audience**: Narrow the target. If the angle says "serious cooks" — the audience is serious cooks, not generic homeowners
- **Transformation journey**: Rewrite current/desired state through the angle's specific world
- **Pain points**: New pains specific to the angle's audience (not generic category pains)
- **Language map**: New phrases the angle's audience actually uses — pain phrases, desire phrases, search queries, emotional triggers
- **Brand positioning**: The angle IS the primary positioning. Generate 3 angles where the first is the strongest interpretation of the owner's words
- **Content hooks**: 50 new hooks that only make sense for this specific angle — not generic ${businessType} hooks
- **Offer statement**: The angle's promise, not the category's promise

The test: if you removed the business type and just read the playbook, could you tell this is about the owner's specific angle? If it reads like any other ${businessType}, you haven't gone far enough.

Keep the same JSON structure as the existing playbook. Generate 50 hooks in lovedHooks. Generate 3 brand angles.

Respond with ONLY valid JSON (no markdown fencing).`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const playbook = JSON.parse(cleaned) as BrandPlaybook;
  playbook.generatedAt = new Date().toISOString();
  playbook.version = "2.1-refined";

  // Store refined playbook
  await sql`
    UPDATE sites
    SET brand_playbook = ${JSON.stringify(playbook)},
        updated_at = NOW()
    WHERE id = ${siteId}
  `;

  // Replace hook_bank with refined hooks
  await sql`DELETE FROM hook_bank WHERE site_id = ${siteId}`;
  const hooks = playbook.contentHooks.lovedHooks || [];
  for (const hook of hooks) {
    await sql`
      INSERT INTO hook_bank (site_id, text, category, rating)
      VALUES (${siteId}, ${hook.text}, ${hook.category}, 'loved')
      ON CONFLICT DO NOTHING
    `;
  }

  // Update brand_voice
  const primaryAngle = playbook.brandPositioning.selectedAngles[0];
  const brandVoice = {
    tone: primaryAngle?.tone || "",
    keywords: playbook.audienceResearch.languageMap.desirePhrases.slice(0, 10),
    avoid: [],
    _source: "refined_v2.1",
    _subscriberAngle: angle,
  };

  await sql`
    UPDATE sites
    SET brand_voice = ${JSON.stringify(brandVoice)}, updated_at = NOW()
    WHERE id = ${siteId}
  `;

  // Regenerate content topics
  await sql`DELETE FROM content_topics WHERE site_id = ${siteId}`;
  generateContentTopics(siteId, playbook).catch((err) => {
    console.error("Topic regeneration failed:", err instanceof Error ? err.message : err);
  });

  // Derive pillar+tag config from the sharpened playbook
  const pillarConfig = await derivePillarConfig(playbook);
  await sql`
    UPDATE sites
    SET pillar_config = ${JSON.stringify(pillarConfig)}::jsonb, updated_at = NOW()
    WHERE id = ${siteId}
  `;

  // Derive image style from the sharpened playbook
  try {
    const { deriveImageStyle } = await import("@/lib/image-gen/derive-style");
    const siteName = (await sql`SELECT name FROM sites WHERE id = ${siteId}`)[0]?.name as string || "";
    await deriveImageStyle(siteId, siteName, businessType, angle);
  } catch (err) {
    console.error("Image style derivation failed:", err instanceof Error ? err.message : err);
  }

  // Seed blog content now that the playbook is sharpened
  try {
    const { seedBlogContent } = await import("@/lib/blog-seed");
    await seedBlogContent(siteId);
  } catch (err) {
    console.error("Blog seed after sharpen failed:", err instanceof Error ? err.message : err);
  }

  return playbook;
}

/**
 * Derive a two-tier pillar+tag config from a sharpened playbook.
 * Uses Haiku to produce clean, concise pillar/tag names from the
 * verbose playbook themes and pain points.
 */
async function derivePillarConfig(playbook: BrandPlaybook): Promise<Array<{
  id: string;
  label: string;
  description: string;
  tags: Array<{ id: string; label: string }>;
}>> {
  const angle = playbook.brandPositioning.selectedAngles[0];
  const themes = angle?.contentThemes || [];
  const painPoints = playbook.audienceResearch.painPoints || [];
  const lang = playbook.audienceResearch.languageMap;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `Generate a content pillar configuration for a business blog.

## Business Context
Brand angle: "${angle?.name || "general"}" — ${angle?.tagline || ""}
Content themes: ${themes.join("; ")}

## Playbook Data
Pain points: ${painPoints.slice(0, 5).map((p) => p.pain).join("; ")}
Search phrases: ${lang.searchPhrases.slice(0, 5).join(", ")}

## The Five-Pillar Framework
Every business has the same 5 content pillars — only the labels and tags change:

1. **What we do** — the craft, skill, or service itself (design, technique, methodology)
2. **How we do it** — the process, tools, infrastructure, and standards behind the work
3. **Who we work with** — vendors, materials, partners, artisans, suppliers
4. **Proof it works** — projects, results, case studies, before/after, client stories
5. **Why it matters** — philosophy, perspective, industry opinions, culture, community

## Rules
- Generate exactly 5 pillars following the framework above
- Use industry-specific labels (NOT "What We Do" — use the business's language, e.g., "Design" for a remodeler, "Menu" for a restaurant, "Method" for a trainer)
- Each pillar: short ID (snake_case, max 15 chars), clean 2-4 word label
- Each pillar: 1-sentence description the AI reads during content triage
- Each pillar: 4-6 tags derived from the content themes, pain points, and search phrases
- Tag IDs: snake_case, max 20 chars. Tag labels: 2-4 words
- Each pillar should sustain 20+ unique blog posts — if it can't, it's too narrow
- Tags should be specific enough to guide AI but reusable across many uploads
- CRITICAL: Follow the 5-pillar framework exactly. Do NOT create a pillar for a single methodology or process — that belongs as a tag, not a pillar. Pillar 3 MUST be about vendors/materials/partners — not a process.

Respond with ONLY valid JSON (no markdown fencing):
[
  {"id": "...", "label": "...", "description": "...", "tags": [{"id": "...", "label": "..."}]}
]`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  try {
    const config = JSON.parse(cleaned);
    if (Array.isArray(config) && config.length > 0) {
      return config;
    }
  } catch {
    console.error("Pillar config derivation failed to parse, using fallback");
  }

  // Fallback: simple derivation without AI
  return themes.slice(0, 5).map((theme, i) => ({
    id: theme.split(/[—\-:]/)[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 20),
    label: theme.split(/[—\-:]/)[0].trim(),
    description: theme,
    tags: [
      { id: `tag_${i}_a`, label: "General" },
      { id: `tag_${i}_b`, label: "Deep Dive" },
    ],
  }));
}

/**
 * Generate 40 content topics from the playbook.
 */
async function generateContentTopics(siteId: string, playbook: BrandPlaybook): Promise<void> {
  const angle = playbook.brandPositioning.selectedAngles[0];
  const lang = playbook.audienceResearch.languageMap;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Generate 40 blog topic ideas for a ${angle?.name || "general"} brand.

Search phrases the audience uses: ${lang.searchPhrases.join(", ")}
Pain phrases: ${lang.painPhrases.slice(0, 5).join(", ")}
Desire phrases: ${lang.desirePhrases.slice(0, 5).join(", ")}

Organize into 8 clusters of 5 topics each. Each topic should target a specific search query.

Respond with ONLY valid JSON (no markdown):
{
  "topics": [
    {"title": "<topic title>", "search_query": "<target search query>", "intent": "informational|transactional|navigational", "priority": "high|medium|low", "pillar": "<content pillar>", "cluster": "<cluster name>"}
  ]
}`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const data = JSON.parse(cleaned);

  for (const topic of data.topics || []) {
    await sql`
      INSERT INTO content_topics (site_id, title, search_query, intent, priority, pillar, cluster)
      VALUES (${siteId}, ${topic.title}, ${topic.search_query}, ${topic.intent}, ${topic.priority}, ${topic.pillar}, ${topic.cluster})
    `;
  }
}
