#!/usr/bin/env node
/**
 * Seed marketing blog article (batch 10) for TracPost's own blog.
 * Category-defining positioning piece: "TracPost Isn't a Social Media Tool."
 *
 * Usage:
 *   node scripts/seed-marketing-blog-batch10.js
 *
 * Requires DATABASE_URL. Finds the TracPost site by blog_slug = 'tracpost'.
 * Skips any article whose slug already exists.
 */

const { neon } = require("@neondatabase/serverless");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// ─── Article 28: TracPost Isn't a Social Media Tool ───────────────────────────

const article28 = {
  slug: "tracpost-isnt-a-social-media-tool-heres-what-it-actually-is",
  title: "TracPost Isn't a Social Media Tool. Here's What It Actually Is.",
  meta_title: "TracPost Isn't a Social Media Tool",
  excerpt: "If you've been trying to figure out what category TracPost fits into, stop. The category doesn't exist yet.",
  content_type: "deep_dive",
  content_pillar: "growth",
  tags: ["what is tracpost", "tracpost review", "content automation platform", "social media for contractors", "marketing automation local business", "alternative to hootsuite", "content creation platform"],
  body: `We get the question constantly. "So you're like Hootsuite?" Or Buffer, or Later, or Sprout Social -- pick your favorite. People hear "social media" and reach for the nearest category. It is a reasonable instinct. But the answer is no, and the reason matters.

TracPost is not a social media scheduling tool. It is not a marketing agency. It is not a CMS, not an AI writing assistant, not an SEO platform. It is all of those things fused into a single system that runs from the photos on your phone. And the reason nobody can place it in a category is because the category did not exist until we built it.

## The Blank Screen Problem

Every tool in the marketing stack shares one assumption: you already have content. Hootsuite gives you a calendar and a text field. Buffer gives you a queue. Later gives you a grid preview. They are beautifully designed tools that do absolutely nothing until you type something into them.

For a general contractor who just finished a kitchen remodel at 6 PM and has a crew starting demolition at 7 AM tomorrow, a blank caption field is not a tool. It is a wall.

AI writing tools like ChatGPT or Jasper move the wall slightly. They generate text from prompts. But you still need to sit down, open a laptop, think about what to write, type a prompt, review the output, find the right photos, format everything for each platform, and hit publish. That is thirty minutes you do not have on a Tuesday night after a twelve-hour day.

The gap in the market was never "we need a better text field." It was: someone needs to look at the work this business does every day and turn it into marketing, without the business owner lifting a finger beyond the photos they already take.

## What Each Category Actually Does (and Where It Stops)

Social media scheduling tools manage distribution. You create the content, they send it to platforms on a schedule. Without content, they are an empty calendar.

Marketing agencies create content for you -- in theory. In practice, they need you to send them photos, approve drafts, explain your services, and manage their output. They charge two to five thousand dollars a month and still post generic content unless you manage them like a second job.

CMS platforms like WordPress and Squarespace build you a website. A static one. The site exists and then it sits there -- no new content, no blog articles, no search engine signals. A beautiful brochure that Google slowly forgets about.

SEO tools like Ahrefs and SEMrush tell you what to write. They analyze keywords, audit your pages, and generate reports. Useful information, but information is not content. Knowing you should rank for "kitchen remodel Dallas" does not produce the article that ranks for it.

Marketing automation platforms like HubSpot and Mailchimp automate workflows -- emails, CRM sequences, lead nurturing. They automate the delivery of marketing you already created. They do not create it.

Every one of these tools solves a real problem. But each one assumes somebody else already solved the problem before it: that content exists, that someone created it, that a human sat down and did the work of turning business activity into marketing material. For local service businesses running lean with no marketing staff, that assumption is fatal.

## The Convergence

Here is what a contractor, landscaper, painter, or plumber actually needs. They need a single system that watches them do their job and turns the evidence of that job into marketing across every channel that matters.

TracPost replaces the social media scheduler, the content writer, the blog platform, the SEO content engine, the Google Business Profile manager, and the review response system. Not by being a worse version of each one stitched together, but by solving the problem none of them were designed to solve: content creation from raw visual assets and brand context.

The workflow starts with photos. Not one photo -- five to ten photos from a project. The tile going in. The framing before drywall. The finished kitchen from three angles. The homeowner smiling in front of their new porch. These are the photos contractors already take, every day, on every job. They sit in camera rolls doing nothing.

TracPost takes those photos and builds everything from them. Social posts written in the voice your brand actually uses -- not a generic template, but a voice profile built from your past content, your industry, your market position. Captions, hashtags, formatting, all calibrated per platform. Published across Instagram, TikTok, Facebook, YouTube, Pinterest, LinkedIn, X, and Google Business Profile. A blog article drafted from the project narrative. SEO content generated around the services and locations your business actually covers. Google Business Profile photos uploaded, posts published, reviews responded to.

From photos on a phone to a full marketing operation. No blank screen. No prompts. No calendar to manage. No agency to babysit.

## The Car and the Steering Wheel

Comparing TracPost to Hootsuite is like comparing a car to a steering wheel. The steering wheel is a fine piece of engineering. But it does not move without an engine, transmission, wheels, and fuel. Hootsuite is the steering wheel -- it points content at platforms. TracPost is the car. It generates the power, builds the momentum, and the steering is just one thing it does along the way.

This is not a criticism of scheduling tools. They were built for social media managers who create content professionally. That is a real job and those are real tools for it. But a roofing contractor in Memphis does not have a social media manager. They have a phone full of project photos and zero minutes between the job site and the next estimate.

TracPost was built for that reality. Not for marketers who need better tools, but for business owners who need marketing to happen without becoming marketers themselves.

## What We Actually Replace

When a business signs up for TracPost, here is what they typically stop paying for:

A social media scheduling tool. TracPost publishes natively to all eight platforms.

A freelance content writer or agency retainer. TracPost writes captions, blog articles, and web content from project photos and brand context.

A separate blog or CMS. TracPost generates and publishes SEO-optimized articles directly.

A GBP management tool or service. TracPost handles Google Business Profile posts, photos, and review responses.

An SEO content service. TracPost generates the content that ranks, not just the reports that tell you what should rank.

That is three to five tools and services consolidated into a single platform that runs from the work you already do. No content calendar. No editorial meetings. No "can you send me some photos to work with." Just the photos from your phone and a platform that knows what to do with them.

## The Category That Did Not Exist

We did not set out to defy categorization. We set out to solve a specific problem: local service businesses produce visual proof of excellent work every single day and have no efficient way to turn that proof into marketing. The existing tools all assumed a content creator was in the loop. We removed that assumption.

What emerged is something that does not fit into the software categories that existed before it. Content creation plus multi-platform publishing plus blog generation plus GBP management plus SEO content plus brand voice plus review management -- there was no name for that combination because nobody had built it as a single system.

We are not disrupting social media tools. We are replacing the need for most of them. The input is your work. The output is your marketing. Everything in between is TracPost.

---

*See it in action at [tracpost.com](https://tracpost.com).*`
};

// ─── Insert ─────────────────────────────────────────────────────────────────

async function main() {
  // Find the TracPost site
  const sites = await sql`
    SELECT s.id FROM sites s
    JOIN blog_settings bs ON bs.site_id = s.id
    WHERE s.blog_slug = 'tracpost'
    LIMIT 1
  `;

  if (sites.length === 0) {
    console.error("No site found with blog_slug = 'tracpost'");
    process.exit(1);
  }

  const siteId = sites[0].id;
  console.log(`Found TracPost site: ${siteId}`);

  const articles = [article28];

  for (const a of articles) {
    const existing = await sql`
      SELECT id FROM blog_posts WHERE site_id = ${siteId} AND slug = ${a.slug}
    `;
    if (existing.length > 0) {
      console.log(`SKIP (already exists): ${a.slug}`);
      continue;
    }

    const schemaJson = {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: a.title,
      description: a.excerpt,
      author: {
        "@type": "Organization",
        name: "TracPost",
        url: "https://tracpost.com",
      },
      publisher: {
        "@type": "Organization",
        name: "TracPost",
        url: "https://tracpost.com",
        logo: {
          "@type": "ImageObject",
          url: "https://tracpost.com/icon.png",
        },
      },
      datePublished: new Date().toISOString(),
      wordCount: a.body.split(/\s+/).length,
      keywords: a.tags.join(", "),
    };

    await sql`
      INSERT INTO blog_posts (
        site_id, slug, title, body, excerpt,
        meta_title, meta_description, schema_json,
        tags, content_type, content_pillar,
        status, published_at, source
      ) VALUES (
        ${siteId}, ${a.slug}, ${a.title}, ${a.body}, ${a.excerpt},
        ${a.meta_title}, ${a.excerpt.slice(0, 155)},
        ${JSON.stringify(schemaJson)},
        ${a.tags}, ${a.content_type}, ${a.content_pillar},
        'draft', NULL, 'generated'
      )
    `;
    console.log(`INSERTED: ${a.slug}`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
