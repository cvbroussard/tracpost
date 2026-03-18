/**
 * Blog content seeding — runs when a subscriber enables their blog.
 *
 * 1. Creates a welcome/about post assembled from brand playbook data (instant, no AI)
 * 2. Queues 3-5 AI-generated posts from top-priority content topics (background)
 * 3. Triggers theme extraction from the subscriber's brand site
 */
import { sql } from "@/lib/db";
import { generateBlogFromTopic } from "@/lib/pipeline/blog-generator";
import { refreshSiteTheme } from "@/lib/blog-theme";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";

/**
 * Seed the blog with initial content on enable.
 * Call this after blog_settings is created/enabled.
 */
export async function seedBlogContent(siteId: string): Promise<{
  welcomePostId: string | null;
  queuedTopics: number;
}> {
  // Check if blog already has posts (don't re-seed)
  const [existing] = await sql`
    SELECT COUNT(*)::int AS count FROM blog_posts WHERE site_id = ${siteId}
  `;
  if (existing.count > 0) {
    return { welcomePostId: null, queuedTopics: 0 };
  }

  // Load site data
  const [site] = await sql`
    SELECT name, url, brand_playbook, brand_voice
    FROM sites WHERE id = ${siteId}
  `;
  if (!site) return { welcomePostId: null, queuedTopics: 0 };

  const playbook = site.brand_playbook as BrandPlaybook | null;

  // 1. Create welcome post from playbook data (no AI call)
  let welcomePostId: string | null = null;
  if (playbook?.offerCore && playbook?.audienceResearch) {
    welcomePostId = await createWelcomePost(siteId, site, playbook);
  }

  // 2. Queue topic-based posts in background
  let queuedTopics = 0;
  const topics = await sql`
    SELECT id FROM content_topics
    WHERE site_id = ${siteId} AND status = 'queued'
    ORDER BY
      CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      created_at ASC
    LIMIT 5
  `;

  // Fire-and-forget: generate in background
  for (const topic of topics) {
    generateBlogFromTopic(topic.id as string).catch((err) => {
      console.error(`Blog seed: topic generation failed for ${topic.id}:`, err instanceof Error ? err.message : err);
    });
    queuedTopics++;
  }

  // 3. Trigger theme extraction (fire-and-forget)
  if (site.url) {
    refreshSiteTheme(siteId).catch((err) => {
      console.error("Blog seed: theme extraction failed:", err instanceof Error ? err.message : err);
    });
  }

  return { welcomePostId, queuedTopics };
}

/**
 * Assemble a welcome/about post from brand playbook data.
 * No AI call — just template assembly from existing data.
 */
async function createWelcomePost(
  siteId: string,
  site: Record<string, unknown>,
  playbook: BrandPlaybook
): Promise<string> {
  const siteName = String(site.name);
  const siteUrl = String(site.url || "");
  const angle = playbook.brandPositioning.selectedAngles[0];
  const offer = playbook.offerCore.offerStatement;
  const journey = playbook.audienceResearch.transformationJourney;

  const title = `Welcome to ${siteName}`;
  const slug = `welcome-to-${siteName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;

  const body = `## Who We Are

${siteName} exists for one reason: **${offer.emotionalCore}**.

${offer.finalStatement}

## The Journey

You're here because you know where you are — ${journey.currentState.slice(0, 200)}.

And you know where you want to be — ${journey.desiredState.slice(0, 200)}.

That gap between the two? That's exactly where we work.

## Our Approach

${angle ? `We believe in **${angle.name}** — ${angle.tagline}.` : "We believe in meeting you where you are and guiding you forward."}

${angle?.tone ? `You'll find our style is ${angle.tone}. No fluff, no empty promises.` : ""}

## What You'll Find Here

This blog is where we share insights, stories, and practical guidance. Every post is crafted to move you closer to the transformation you're looking for.

${playbook.offerCore.benefits.slice(0, 3).map((b) => `- ${b}`).join("\n")}

## Let's Get Started

Browse our latest posts below, or [visit our website](${siteUrl}) to learn more about how we can help.`;

  const excerpt = `${offer.finalStatement.slice(0, 150)}`;

  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: excerpt,
    author: {
      "@type": "Organization",
      name: siteName,
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: siteName,
    },
    datePublished: new Date().toISOString(),
    wordCount: body.split(/\s+/).length,
  };

  const [post] = await sql`
    INSERT INTO blog_posts (
      site_id, slug, title, body, excerpt,
      meta_title, meta_description, schema_json,
      tags, content_pillar, status, published_at, source
    ) VALUES (
      ${siteId}, ${slug}, ${title}, ${body}, ${excerpt},
      ${`${title} — ${siteName}`}, ${excerpt.slice(0, 155)},
      ${JSON.stringify(schema)},
      ${["welcome", "about"]}, ${"showcase"},
      'published', NOW(), 'generated'
    )
    ON CONFLICT (site_id, slug) DO NOTHING
    RETURNING id
  `;

  return post?.id || null;
}
