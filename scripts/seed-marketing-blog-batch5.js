#!/usr/bin/env node
/**
 * Seed three SEO-targeted marketing blog articles (batch 5) for TracPost's own blog.
 * Revised tone: shorter (700-900 words), solution-forward, relief not lecture.
 * TracPost introduced at ~60% mark, reader validated quickly, no homework feeling.
 *
 * Usage:
 *   node scripts/seed-marketing-blog-batch5.js
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

// ─── Article 13: How to Market When You Don't Have Time ───────────────────────

const article13 = {
  slug: "how-to-market-your-business-when-you-dont-have-time",
  title: "How to Market Your Business When You Don't Have Time to Market Your Business",
  meta_title: "How to Market Your Business When You Don't Have Time",
  excerpt: "You are not lazy. You are running a business. The marketing industry wants you to believe you need a content calendar, a brand strategy, and three hours a week. You don't. You need one shortcut that actually works.",
  content_type: "deep_dive",
  content_pillar: "growth",
  tags: ["marketing for busy business owners", "small business marketing", "no time to market", "marketing automation", "service business growth", "local business marketing"],
  body: `You already know you should be posting on social media. You already know your Google Business Profile needs attention. You already know that the competitor down the road who keeps showing up in every feed is getting calls that should be yours.

You are not going to do anything about it. Not because you are lazy -- because you are running a twelve-hour day and marketing is item number forty-seven on a list that only gets to item twelve.

This article is not going to give you a content calendar. It is not going to tell you to wake up earlier or batch your posts on Sunday night. You have heard all of that, and none of it changed anything, because the advice assumes you have time you do not have.

## The Marketing Industry Has a Complexity Problem

Most marketing advice is written by marketers. They have an incentive to make marketing sound complicated because complicated problems require expensive solutions -- agencies, consultants, courses, retainers.

For a local service business, marketing is not complicated. The evidence is clear about what actually drives new customers to your door: showing up when someone searches for your service in your area, and looking active and competent when they find you. That means a Google Business Profile with recent posts and reviews. Social media profiles with real photos of your work. A website that does not look abandoned.

That is it. Not a funnel. Not a lead magnet. Not a six-part email sequence. Photos of your actual work, posted consistently, in the places where customers are already looking.

The problem was never strategy. You already know what to post -- your finished projects look great. The problem is execution. Taking those photos from your camera roll and turning them into posts across eight platforms, with proper captions, proper formatting, and proper timing, while also estimating jobs, managing crews, handling callbacks, and keeping your books straight.

## What Actually Moves the Needle

Here is what the data shows about local service businesses that grow through online presence. Businesses with active Google Business Profiles get 70% more visits than inactive ones. Businesses that post real project photos outperform those using stock imagery by a wide margin on engagement. Consistency matters more than quality -- three decent posts per week beats one perfect post per month.

The ingredients are simple: photos of your work, a few words about what was done, and the discipline to post it everywhere, repeatedly, for months.

You already have the photos. Most contractors, detailers, landscapers, and service pros take photos of their work -- for their own records, to show the next customer, to text to their spouse. The content exists. It is sitting in your camera roll right now.

The gap between your camera roll and your online presence is where every good intention goes to die. That gap is not a strategy problem. It is a logistics problem. And logistics problems have mechanical solutions.

## The Shortcut

This is the part where you are expecting another paragraph about discipline and time management. Instead, here is the reality: you are not going to become a social media manager on top of everything else you do. You should stop trying.

[TracPost](https://tracpost.com) exists for exactly this moment -- the moment you accept that the work is never going to get done manually. Here is how it works: you take a photo of your finished project. That is your entire contribution. The platform writes the caption, adapts the format for each platform, and publishes to Instagram, Facebook, TikTok, YouTube, LinkedIn, X, Pinterest, Nextdoor, your blog, and your Google Business Profile. One photo from your phone becomes ten pieces of published content.

No content calendar. No logging into eight apps. No sitting at your kitchen table at 9 PM trying to think of a caption for a photo you took eleven hours ago. You snap the photo while you are still on the job, and the rest happens without you.

The captions are written in your voice, not generic marketing-speak. The hashtags are platform-specific. The blog post is a real article with your project details, not a recycled social media caption. Your Google Business Profile gets a proper update that helps your local search ranking.

## What This Actually Costs

[TracPost](https://tracpost.com) runs $99 to $219 per month depending on the plan. For context, a marketing agency charges $2,000 to $5,000 per month and still needs you to send them photos. A freelancer charges $500 to $1,500 and disappears after four months. A full-time hire is $4,500 or more per month plus benefits and management overhead.

At $99 per month, the math is simple. If your online presence generates one additional customer per month -- one -- and your average job is $3,000 or more, the platform pays for itself thirty times over.

## What Happens Next

You take a photo of your next finished job. You open the app and capture it. You go back to work.

Within hours, your project is live on every platform that matters. Your Google Business Profile shows fresh activity. Your Instagram has a new post that looks like you spent twenty minutes on it. Your blog has a new article. Your competitors are still trying to remember their Facebook password.

You did not become a marketer. You did not find extra hours in the day. You did not follow a content calendar or complete a branding worksheet. You took a photo of work you were already doing, and a system turned it into the marketing presence your business deserves.

That is not a hack. That is not a workaround. That is the way it should have worked all along.

---

*You do not need more time. You need fewer steps between your work and your online presence. [TracPost](https://tracpost.com) eliminates those steps. $99 per month. One photo. Everything else handled.*`
};

// ─── Article 14: 8 Platforms, One Photo ──────────────────────────────────────

const article14 = {
  slug: "8-platforms-one-photo-how-smart-businesses-show-up-everywhere",
  title: "8 Platforms, One Photo: How Smart Businesses Show Up Everywhere",
  meta_title: "8 Platforms, One Photo: How Smart Businesses Show Up Everywhere",
  excerpt: "Instagram wants square crops and thirty hashtags. TikTok wants vertical video. LinkedIn wants professional polish. Google wants local keywords. Managing all of them is a full-time job -- unless one photo can do the work of eight posts.",
  content_type: "authority_overview",
  content_pillar: "growth",
  tags: ["post to multiple platforms", "social media automation", "cross-platform posting", "social media management", "multi-platform marketing", "service business growth"],
  body: `Your customers are not all in one place. The homeowner who needs a kitchen remodel searches Google. The young couple looking for a landscaper scrolls Instagram. The property manager finds contractors on LinkedIn. The neighbor three streets over discovers local businesses on Nextdoor. The DIY-curious browser stumbles onto your work through Pinterest.

If you are only on one or two platforms, you are invisible to everyone who does not use those platforms. And if you are trying to manage all of them manually, you already know how that ends -- you post on Instagram for two weeks, forget about Facebook entirely, never figure out TikTok, and your Google Business Profile still has your old phone number.

## Why Cross-Posting Does Not Work

The obvious solution is to write one post and copy it everywhere. Every scheduling tool on the market lets you do this. And it almost works -- except each platform has its own rules, and the platforms penalize content that was clearly not made for them.

Instagram rewards carousel posts with detailed captions and curated hashtag sets. Facebook favors community-oriented language and rewards engagement in comments. TikTok prioritizes vertical video and short, punchy text. LinkedIn expects professional tone and industry context. Pinterest needs keyword-rich descriptions and specific aspect ratios to surface in search. Google Business Profile posts directly influence your local search ranking and need location-specific language. Nextdoor favors neighborhood-relevant content with a conversational tone.

Copying the same caption with the same formatting to all eight platforms means it is optimized for none of them. The Instagram caption is too long for Twitter. The Twitter caption is too short for LinkedIn. The Facebook post sounds wrong on Pinterest. The hashtags that work on Instagram are meaningless on Google Business Profile.

This is why most small businesses settle for one or two platforms and ignore the rest. Managing eight accounts with platform-native content is genuinely a full-time job. The formatting alone takes longer than writing the original caption.

## The Multiplier Effect

Here is what is interesting about multi-platform presence for a local service business: the platforms do not just add reach -- they multiply it. A customer who sees your work on Instagram and then finds your Google Business Profile with matching recent content is significantly more likely to call than someone who only sees you in one place. The repetition builds trust before you ever speak to them.

Search engines also reward multi-platform presence. Google's algorithm considers your overall online footprint. A business with active profiles on eight platforms, consistent posting, and a blog with real project content outranks a business with a dormant Facebook page and nothing else. It is not even close.

The businesses that show up everywhere do not look bigger because they post more. They look more established, more trustworthy, and more active. A homeowner comparing two contractors -- one with a sparse Instagram and nothing else, one with fresh content across Instagram, Facebook, Google, a blog, and Pinterest -- will call the second one every time, even if the first one does better work.

## What One Photo Becomes

This is the part that changes the math. [TracPost](https://tracpost.com) takes a single photo from your phone and turns it into platform-native content for every channel. Not copied and pasted -- actually adapted.

Here is what happens when you capture a finished deck restoration:

Your Instagram gets a carousel-ready post with a detailed caption, relevant hashtags, and proper aspect ratio. Facebook gets a community-focused post -- "Another Westlake deck ready for summer" -- designed to generate local engagement. Google Business Profile gets a business update with service keywords and your city name, directly boosting your local search ranking. Your blog gets a 300-word project article with the photo, the scope of work, and the materials used -- a page that lives on your website and ranks in search results permanently. Pinterest gets an optimized pin with keyword-rich description and vertical formatting that surfaces when someone searches "deck restoration ideas." LinkedIn gets a professional project highlight. TikTok gets a formatted post ready for your visual content. Nextdoor gets a neighborhood-friendly update.

Eight platforms. Eight different formats. Eight different caption strategies. From one photo taken in fifteen seconds while you are still on the job site.

## The Numbers

Without a system, posting native content to eight platforms takes 45 minutes to an hour per project -- if you know what you are doing. Most business owners would spend longer. At three projects per week, that is three hours of content work. Every week. On top of the actual work.

With [TracPost](https://tracpost.com), the time investment is the photo itself. Fifteen seconds. The platform handles the writing, formatting, and publishing. $99 to $219 per month, depending on the plan.

Three hours per week of skilled marketing labor, or fifteen seconds and a subscription. The businesses that show up everywhere are not working harder than you. They just solved the distribution problem.

## Showing Up Is the Strategy

For local service businesses, the strategy debate is over. You do not need a viral moment. You do not need a brand campaign. You need to show up consistently, in every place your customers might look, with real photos of real work. The businesses that do this get found. The ones that do not get scrolled past.

One photo. Eight platforms. Every time. That is not a marketing strategy -- it is a marketing engine.

---

*Your customers are scattered across eight platforms. Your content should be too. [TracPost](https://tracpost.com) turns one job site photo into eight platform-native posts, a blog article, and a Google Business Profile update. $99 per month. Fifteen seconds per project.*`
};

// ─── Article 15: You Don't Need an Agency. You Need an Engine. ───────────────

const article15 = {
  slug: "you-dont-need-a-marketing-agency-you-need-a-marketing-engine",
  title: "You Don't Need a Marketing Agency. You Need a Marketing Engine.",
  meta_title: "You Don't Need a Marketing Agency. You Need a Marketing Engine.",
  excerpt: "You got the agency quote. $3,000 a month. And they still need you to send them photos. There is a better model -- one that starts from your work, runs without management, and costs less than a single agency invoice.",
  content_type: "deep_dive",
  content_pillar: "growth",
  tags: ["marketing agency alternative", "marketing agency cost", "small business marketing", "marketing automation", "service business marketing", "local business growth"],
  body: `You sat through the agency pitch. They showed you a portfolio of polished Instagram feeds. They talked about brand voice, content strategy, editorial calendars. They quoted you $3,000 a month. Maybe $4,000. Maybe $2,500 if you signed a twelve-month contract.

Then they said something that should have been a red flag but sounded reasonable at the time: "We will need you to send us photos and project details each week so we can create your content."

You are paying $3,000 a month AND doing the work of supplying the raw material. The agency is the middleman between your camera roll and the internet. That is a $36,000-per-year middleman.

## The Mismatch Nobody Talks About

Good agencies exist. The best ones are excellent at what they do -- brand strategy, creative campaigns, paid advertising, market positioning. If you are a consumer brand launching a product line, a restaurant opening a second location, or a tech company building market awareness, an agency earns its fee.

But local service businesses are not consumer brands. Your marketing problem is fundamentally different, and agencies are not built to solve it.

Here is the mismatch: agencies need raw material to create content. For a clothing brand, that material is product photos taken in a studio -- the agency can arrange the shoot. For a restaurant, it is plated food shot under controlled lighting -- the agency can hire the photographer. For a SaaS company, it is screenshots and demos -- the agency can create those at their desk.

For a contractor, a landscaper, a detailer, or any service business that works on location? The raw material is a photo taken at 2 PM on a Tuesday on a job site that the agency has never visited and never will. No amount of creative strategy changes this. The agency cannot produce your content without your content.

So you end up in a cycle. The agency emails asking for photos. You are on a job site and do not respond. They follow up. You send three photos from your camera roll with no context. They write generic captions because they do not know the scope, the materials, or the story behind the work. The post goes up. It looks fine. It could be any contractor in your city.

You are paying premium rates for generic output because the agency model depends on a content supply chain that does not exist for field service businesses.

## Service vs. Engine

An agency is a service. People doing tasks on your behalf, managed by other people, billing by the hour or the month. Services scale with headcount, which is why they cost what they cost. Every post you publish went through a strategist, a copywriter, a designer, and an account manager. Four salaries, split across their client roster, baked into your invoice.

An engine is a system. It takes an input, applies a process, and produces an output. It does not need management. It does not take vacation. It does not ask for a creative brief. It does not send you a weekly email asking for content. It runs.

The question for your business is whether you need a service or an engine. If you need someone to develop your brand identity, plan a seasonal campaign, or manage a six-figure ad budget, you need a service. If you need your actual work turned into consistent, multi-platform content without adding hours to your week, you need an engine.

Most local service businesses need the engine. They just did not know it existed, so they hired an agency and got a service that solves a different problem.

## What the Engine Looks Like

[TracPost](https://tracpost.com) is the engine. Your photo is the fuel. The platform is the machine. The output is published content across eight social platforms, your blog, and your Google Business Profile.

You take a photo of a completed job. The platform writes a caption that sounds like you -- not like a marketing agency trying to sound like you. It formats the content natively for each platform. It publishes. Your Instagram shows a detailed project post. Your Facebook shows a community-relevant update. Your Google Business Profile gets a location-optimized business post. Your blog gets a real article. Pinterest, LinkedIn, TikTok, Nextdoor -- all updated, all formatted correctly, all from one photo.

No weekly check-in call. No content approval workflow. No "can you send us some photos from this week" email. No twelve-month contract. No scope creep invoices.

The content is specific to your work because it starts from your work. It is not stock photography with your logo. It is not a Canva template with a motivational quote. It is a photo of the deck you just finished, the kitchen you just revealed, the yard you just transformed -- with a caption that describes what was actually done.

## The Cost Comparison

An agency: $2,000 to $5,000 per month. Twelve-month contracts. Still needs your photos. Still needs your time for approvals and feedback. Produces polished content that may or may not look like your actual business.

[TracPost](https://tracpost.com): $99 to $219 per month. No contract. No content supply emails. No approval workflow. Produces authentic content from your real projects, published across every platform that matters.

For a business doing $2M to $10M in revenue, the agency model means spending $24,000 to $60,000 per year on marketing content. The engine model means spending $1,200 to $2,600 per year for comparable -- often better -- coverage, because the content is real and the consistency is automatic.

The savings are obvious. The less obvious advantage is authenticity. The homeowner choosing between two contractors will pick the one whose feed shows real local projects over the one whose feed looks like a marketing agency's template library. Real work wins.

## When an Agency Still Makes Sense

If you have the budget and the ambition for creative campaigns -- a brand video, a regional advertising push, a grand opening event -- hire an agency for that specific project. Agencies are excellent at campaign work. Pay them for a defined scope, get deliverables, and move on.

But do not hire an agency to solve a consistency problem. Consistency is a systems problem. Systems problems need engines, not services. The engine runs your daily content from real work. The agency runs your quarterly campaign from creative strategy. Different tools for different jobs.

---

*An agency needs your photos, your time, and $3,000 a month to post content that could be any business in your industry. An engine needs one photo and $99 a month to post content that is unmistakably yours. [TracPost is the engine](https://tracpost.com). Your work is the fuel.*`
};

// ─── Insert logic ───────────────────────────────────────────────────────────

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

  const articles = [article13, article14, article15];

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
