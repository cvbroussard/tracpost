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
    max_tokens: 8192,
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

  // Generate content topics (fire and forget)
  generateContentTopics(siteId, playbook).catch((err) => {
    console.error("Content topic generation failed:", err instanceof Error ? err.message : err);
  });

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
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `You are a brand strategist. I have a baseline brand playbook for a **${businessType}** in **${location}**. The owner has shared their unique angle — their differentiator that separates them from every other ${businessType}.

## The Owner's Angle
"${angle}"

## Existing Baseline Playbook
${JSON.stringify(existing, null, 2)}

## Your Task
Regenerate the ENTIRE playbook, reshaping every section through the lens of the owner's unique angle. This is not a generic ${businessType} anymore — the angle fundamentally changes:
- **Who** the target audience is (narrower, more specific)
- **What** pain points matter (different from generic)
- **How** the brand positions itself (the angle IS the positioning)
- **What** content hooks resonate (must reflect the angle)
- **What** the offer statement promises (the angle's promise)

The owner's angle should be the DNA of every element. If the angle says "serious cooks" — the audience is serious cooks, not homeowners. If the angle says "culinary experience" — the pain points are about cooking workflow, not aesthetics.

Keep the same JSON structure as the existing playbook. Generate 50 hooks in lovedHooks. Generate 3 brand angles where the first is the strongest interpretation of the owner's angle.

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

  return playbook;
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
