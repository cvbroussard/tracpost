/**
 * Tier-aware brand playbook generator.
 *
 * Produces the same BrandPlaybook shape as auto-generate.ts but layers
 * BrandSignals into the prompt proportional to the site's tier:
 *
 *   minimal   — identical to baseline (no signals appended)
 *   moderate  — voice profile appended; informs tone/themes only
 *   rich      — voice + topics + customer_voice + exemplars; can shape
 *               audience research and offer core meaningfully
 *
 * The strategic skeleton (audience research, brand angle framework,
 * offer structure) remains category-derived in all tiers — augmentation
 * shapes HOW and WHO, never invents WHAT from thin air.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";
import type { Tier } from "./score";
import type { BrandSignals } from "./extract";

const anthropic = new Anthropic();

interface GenerateInput {
  businessType: string;
  location?: string;
  websiteUrl?: string;
  tier: Tier;
  signals?: BrandSignals;
  subscriberAngle?: string;  // explicit strategic differentiator from sharpen
}

function buildSignalsSection(tier: Tier, signals?: BrandSignals): string {
  if (tier === "minimal" || !signals) return "";

  const voice = signals.voice;
  const moderateBlock = `

## OBSERVED VOICE PROFILE (from this brand's actual social presence)
This brand currently communicates in these specific ways:
- Tone: ${voice.tone}
- Length pattern: ${voice.length_pattern}
- Emoji use: ${voice.emoji_use}
- Hashtag use: ${voice.hashtag_use}
- Casing: ${voice.casing}
- Sign-offs: ${voice.sign_offs.join("; ") || "(none observed)"}
- Distinctive traits: ${voice.distinctive_traits.join("; ") || "(none observed)"}

Incorporate these authentic patterns when generating brand voice fields (tone, contentThemes, languageMap). Do NOT copy specific captions; let these observations inform how the brand SHOULD continue to sound. The strategic content (audience research, brand angles framework) remains category-derived — voice observations shape HOW the brand communicates, not WHAT the brand strategically focuses on.`;

  if (tier === "moderate") return moderateBlock;

  // RICH tier: full augmentation
  const t = signals.topics;
  const cv = signals.customer_voice;
  const ex = signals.exemplars;

  return moderateBlock + `

## RECURRING TOPICS (what this brand actually talks about)
- Primary themes: ${t.primary_themes.join(", ") || "(none)"}
- Secondary themes: ${t.secondary_themes.join(", ") || "(none)"}
- Notably absent (category-typical topics this brand doesn't cover): ${t.notably_absent.join(", ") || "(none)"}

## CUSTOMER VOICE (how customers describe the brand in reviews)
- Repeated descriptors: ${cv.repeated_descriptors.join(", ") || "(none)"}
- Outcomes mentioned: ${cv.outcomes_mentioned.join(", ") || "(none)"}
- Common phrases: ${cv.common_phrases.join("; ") || "(none)"}
- Customer tone: ${cv.tone}

## PROVEN-RESONANT EXEMPLARS (high-engagement captions — what worked)
${ex.top_resonant.map((e, i) => `[${i + 1}] (${e.engagement} engagements) "${e.caption.slice(0, 300)}"`).join("\n") || "(none)"}

## FLAT-OUTCOME EXAMPLES (low-engagement — do NOT replicate this energy)
${ex.flat_outcomes.map((e, i) => `[${i + 1}] (${e.engagement} engagements) "${e.caption.slice(0, 300)}"`).join("\n") || "(none)"}

For RICH-tier generation: customer voice and topical observations can substantially shape audience research (painPhrases, desirePhrases) and offer framing. The strategic positioning still owns the WHAT, but observed evidence can deepen the WHO and HOW. Do NOT slavishly copy the exemplars — treat them as proof of what energy/structure has worked, then generate fresh hooks that share that energy. The flat-outcome examples are anti-patterns; identify what they have in common and avoid those structures.`;
}

/**
 * Generate a tier-aware brand playbook.
 *
 * Does NOT persist to the DB. Caller decides what to do with the output
 * (compare via A/B harness, promote, store as draft, etc.).
 */
export async function generatePlaybookV2(input: GenerateInput): Promise<BrandPlaybook> {
  const { businessType, location, websiteUrl, tier, signals, subscriberAngle } = input;
  const locationStr = location || "nationwide";
  const augmentation = buildSignalsSection(tier, signals);
  const angleSection = subscriberAngle?.trim()
    ? `\n\n## SUBSCRIBER'S STATED DIFFERENTIATOR (highest-priority strategic input)\nThe subscriber explicitly stated this is what makes them different from every other ${businessType}:\n"${subscriberAngle.trim()}"\n\nThis angle MUST anchor the playbook. All audience research, brand angles, content hooks, and offer positioning should center on this differentiator. Historical signals shape voice and topical authenticity but do not override this strategic direction.`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16384,
    messages: [{
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
- Be specific to ${businessType}${location ? ` in ${locationStr}` : ""} — not generic${angleSection}${augmentation}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const playbook = JSON.parse(cleaned) as BrandPlaybook;
  playbook.generatedAt = new Date().toISOString();
  playbook.version = `2.0-v2-${tier}`;
  return playbook;
}
