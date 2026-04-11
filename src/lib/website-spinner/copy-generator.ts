/**
 * Generate website copy from brand playbook using AI.
 * Each page gets tailored content derived from the playbook's
 * positioning, audience research, and offer statement.
 */
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

interface PlaybookContext {
  siteName: string;
  businessType: string;
  location: string;
  tagline: string;
  offer: string;
  tone: string;
  contentThemes: string[];
  painPoints: string[];
  desirePhrases: string[];
}

export interface WebsiteCopy {
  home: {
    heroTitle: string;
    heroSubtitle: string;
    ctaText: string;
    servicesTitle: string;
    servicesSubtitle: string;
    services: Array<{ title: string; description: string }>;
    galleryTitle: string;
    gallerySubtitle: string;
  };
  about: {
    headline: string;
    story: string;        // HTML paragraphs
    values: Array<{ title: string; description: string }>;
    stats: Array<{ value: string; label: string }>;
    brandsTitle: string;
  };
  work: {
    headline: string;
    subtitle: string;
    blogTitle: string;
    blogSubtitle: string;
  };
  contact: {
    headline: string;
    subtitle: string;
  };
  meta: {
    homeTitle: string;
    homeDescription: string;
    aboutTitle: string;
    aboutDescription: string;
    workTitle: string;
    workDescription: string;
    contactTitle: string;
    contactDescription: string;
  };
}

export async function generateWebsiteCopy(ctx: PlaybookContext): Promise<WebsiteCopy> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: `Generate website copy for a ${ctx.businessType} business.

## Business
Name: ${ctx.siteName}
Location: ${ctx.location}
Tagline: ${ctx.tagline}
Offer: ${ctx.offer}
Tone: ${ctx.tone}

## Content Themes
${ctx.contentThemes.join("\n")}

## Audience Pain Points
${ctx.painPoints.slice(0, 3).join("\n")}

## Audience Desires
${ctx.desirePhrases.slice(0, 5).join(", ")}

Generate website copy in the brand's voice. Not generic marketing copy — write as if you ARE this business talking to a specific homeowner who has been burned by other contractors.

Return ONLY valid JSON (no markdown):
{
  "home": {
    "heroTitle": "<compelling headline, 6-10 words, not the tagline>",
    "heroSubtitle": "<2 sentences that speak directly to the audience's pain and desire>",
    "ctaText": "<CTA button text, 2-4 words>",
    "servicesTitle": "<section title for what we do>",
    "servicesSubtitle": "<one sentence describing our approach>",
    "services": [
      {"title": "<service name>", "description": "<2 sentences>"},
      {"title": "<service name>", "description": "<2 sentences>"},
      {"title": "<service name>", "description": "<2 sentences>"}
    ],
    "galleryTitle": "<section title for recent work>",
    "gallerySubtitle": "<one sentence>"
  },
  "about": {
    "headline": "<about page title>",
    "story": "<3 paragraphs as HTML <p> tags. Tell the business story — who we are, why we do this, what makes us different. Write in first person plural. No platitudes.>",
    "values": [
      {"title": "<value>", "description": "<2 sentences explaining how this shows up in our work>"},
      {"title": "<value>", "description": "<2 sentences>"},
      {"title": "<value>", "description": "<2 sentences>"}
    ],
    "stats": [
      {"value": "<number>", "label": "<what it measures>"},
      {"value": "<number>", "label": "<what it measures>"},
      {"value": "<number>", "label": "<what it measures>"}
    ],
    "brandsTitle": "<title for materials/brands section>"
  },
  "work": {
    "headline": "<our work page title>",
    "subtitle": "<one sentence about our portfolio>",
    "blogTitle": "<blog section title>",
    "blogSubtitle": "<one sentence about our articles>"
  },
  "contact": {
    "headline": "<contact page title, inviting>",
    "subtitle": "<2 sentences, warm, professional, removes friction>"
  },
  "meta": {
    "homeTitle": "<SEO title for home, under 60 chars>",
    "homeDescription": "<SEO description, under 160 chars>",
    "aboutTitle": "<SEO title for about>",
    "aboutDescription": "<SEO description>",
    "workTitle": "<SEO title for work/projects>",
    "workDescription": "<SEO description>",
    "contactTitle": "<SEO title for contact>",
    "contactDescription": "<SEO description>"
  }
}

Rules:
- Hero title should NOT be the tagline — it's a different hook
- Services should reflect actual capabilities, not generic categories
- Story should sound human, not corporate
- Stats should be plausible for a ${ctx.businessType} in ${ctx.location}
- All copy should match the tone: ${ctx.tone.slice(0, 100)}`,
    }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  return JSON.parse(cleaned) as WebsiteCopy;
}
