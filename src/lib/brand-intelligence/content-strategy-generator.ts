import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { BrandPlaybook } from "./types";

const anthropic = new Anthropic();

interface TopicEntry {
  title: string;
  searchQuery: string;
  intent: string;
  priority: "high" | "medium" | "low";
  pillar: string;
  cluster: string;
}

/**
 * Generate content strategy — search queries, topic clusters, and
 * blog topics — from a completed brand playbook. Populates the
 * content_topics table for the blog generator to pull from.
 */
export async function generateContentStrategy(
  siteId: string,
  playbook: BrandPlaybook
): Promise<number> {
  const angles = playbook.brandPositioning.selectedAngles;
  const research = playbook.audienceResearch;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `You are an AI-native content strategist. Generate a content strategy optimized for both traditional search AND LLM retrieval.

## Brand Context
Angles: ${angles.map((a) => `"${a.name}" — ${a.tagline}`).join("; ")}
Content themes: ${angles.flatMap((a) => a.contentThemes).join(", ")}

## Audience
Current state: ${research.transformationJourney.currentState.slice(0, 200)}
Desired state: ${research.transformationJourney.desiredState.slice(0, 200)}
Pain points: ${research.painPoints.map((p) => p.pain).join(", ")}
Search phrases: ${research.languageMap.searchPhrases.join(", ")}
Pain phrases: ${research.languageMap.painPhrases.join(", ")}
Desire phrases: ${research.languageMap.desirePhrases.join(", ")}

## Competitive Gaps
${research.competitiveLandscape.marketGaps.join("\n")}

## Instructions

Generate 40 blog topics organized into clusters and pillars. These will be queued for automated blog generation.

For each topic, provide:
- title: An enticing article title (reads like a blog headline, 50-80 chars)
- searchQuery: The realistic search query this article answers
- intent: how_to | comparison | definition | informational | commercial | local
- priority: high | medium | low (based on: offer alignment 35%, urgency 35%, competitive leverage 15%, lead potential 15%)
- pillar: One of 4 pillar names you define
- cluster: A topic cluster name grouping related topics

Create exactly 4 pillars with 10 topics each = 40 topics total.
Create 8-12 clusters that group across pillars.

Respond with ONLY valid JSON (no markdown fencing):

{
  "pillars": ["<4 pillar names>"],
  "topics": [
    {
      "title": "...",
      "searchQuery": "...",
      "intent": "...",
      "priority": "high|medium|low",
      "pillar": "...",
      "cluster": "..."
    }
  ]
}

Rules:
- Titles must be engaging and specific — no generic "Ultimate Guide to X"
- Search queries must sound like real things people type (conversational, specific)
- At least 8 topics should be phrased as questions (matching LLM query patterns)
- At least 5 should target local/geographic intent
- Distribute priority: ~10 high, ~20 medium, ~10 low
- Each cluster should contain 3-6 topics
- Topics should cover the full funnel: awareness → consideration → decision`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as {
    pillars: string[];
    topics: TopicEntry[];
  };

  // Insert topics into content_topics table
  let inserted = 0;
  for (const topic of parsed.topics) {
    const [row] = await sql`
      INSERT INTO content_topics (business_id, title, search_query, intent, priority, pillar, cluster, status)
      SELECT ${siteId}, ${topic.title}, ${topic.searchQuery}, ${topic.intent},
             ${topic.priority}, ${topic.pillar}, ${topic.cluster}, 'queued'
      WHERE NOT EXISTS (
        SELECT 1 FROM content_topics
        WHERE business_id = ${siteId} AND title = ${topic.title}
      )
      RETURNING id
    `;
    if (row) inserted++;
  }

  return inserted;
}
