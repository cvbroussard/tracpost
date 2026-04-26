#!/usr/bin/env node
/**
 * Seed three SEO-targeted marketing blog articles for TracPost's own blog.
 *
 * Usage:
 *   node scripts/seed-marketing-blog-articles.js
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

// ─── Article 1 ──────────────────────────────────────────────────────────────

const article1 = {
  slug: "why-your-competitor-shows-up-on-google-and-you-dont",
  title: "Why Your Competitor Shows Up on Google and You Don't",
  meta_title: "Why Your Competitor Ranks on Google and You Don't",
  excerpt: "Your competitor isn't better at their job. They're just better at telling Google they exist. Here's exactly what they're doing that you're not.",
  content_type: "authority_overview",
  content_pillar: "growth",
  tags: ["seo", "google business profile", "local search", "online visibility", "small business marketing"],
  body: `You search your own trade in your own city, and there they are — your competitor, sitting right at the top of Google. Maybe they're not even the best in town. You know that. Your customers know that. But Google doesn't know that, because Google can only work with what it's been given.

This isn't about who does better work. It's about who tells the better story to a search engine that's deciding, in real time, which businesses to show to someone who needs help right now.

Here's what's actually happening, and what you can do about it.

## They Claimed and Completed Their Google Business Profile

This is the single biggest differentiator in local search, and most business owners either haven't done it or did it halfway three years ago.

Google Business Profile (GBP) is the free listing that shows up in the map results when someone searches "plumber near me" or "best roofing company in [city]." That box with the map, the three businesses, the reviews, the photos — that's the Local Pack, and getting into it is worth more than any ad you could buy.

Your competitor filled out every field. Primary category, secondary categories, service areas, business hours, business description with real keywords, services list with descriptions, and the Q&A section. Google rewards completeness. A profile that's 40% filled out gets treated like a business that's 40% committed to being found.

**What to do:** Log into business.google.com. Go through every single field. Your business description should include the services you offer and the cities you serve — written for humans, not stuffed with keywords. Add every service you provide as a separate line item. Set your service area accurately.

## They Have Reviews, and They're Getting More Every Week

Google's local ranking algorithm weighs three things heavily: relevance, distance, and prominence. Reviews are the primary signal for prominence. Not just how many you have — how fast you're getting new ones.

A business with 47 reviews that got its last one eight months ago will lose to a business with 32 reviews that got three this week. Google reads review velocity as a signal that a business is active, trusted, and worth recommending.

Your competitor probably isn't doing anything sophisticated. They're asking every satisfied customer for a review. Maybe they send a text after the job. Maybe they have a card with a QR code. The mechanism doesn't matter. The consistency does.

**What to do:** Build a review request into your process. The best time to ask is at the moment of satisfaction — the day the project wraps, the moment the customer sees the finished work. Send a direct link to your Google review page. Make it one tap. Don't ask them to "find you on Google" — they won't.

## They Have a Website With Actual Content on It

A brochure website with five pages — Home, About, Services, Gallery, Contact — is better than nothing, but it's barely a signal to Google. It tells the search engine you exist. It doesn't tell it you're an authority.

Your competitor might have a blog, or at least a portfolio page that gets updated. Every new page is a new opportunity for Google to index a relevant search term. A blog post titled "How Much Does a Kitchen Remodel Cost in Denver" is a page that can rank for that exact search. Your brochure site can't.

You don't need to become a content factory. But you need more than a static five-page site that hasn't been touched since it was built.

**What to do:** Start with your most frequently asked questions. Every question a customer asks you is a blog post. "How long does it take to replace a roof?" "What's the difference between quartz and granite?" "Do I need a permit for a bathroom remodel?" Write honest, specific answers. Include your city name naturally. Publish one per month at minimum.

## They Post Regularly — and Google Notices

Google Business Profile has a Posts feature that most businesses ignore entirely. These are short updates that appear on your listing — think of them like social media posts, but they show up directly in Google search results.

Your competitor posts project photos, seasonal promotions, or company updates every week or two. Google sees this activity and interprets it as a signal that the business is alive and engaged. A listing that hasn't posted in six months looks abandoned.

But it goes beyond GBP posts. Google's algorithm considers your entire web presence. Are you publishing on social media? Is your website getting new content? Are people engaging with your brand online? All of these are signals that contribute to your prominence score.

**What to do:** Post to your Google Business Profile at least twice a month. Show completed projects. Announce seasonal services. Share a customer review as a post. It takes five minutes and it directly impacts your local ranking.

## Their Photos Are Doing Heavy Lifting

Google's own data shows that businesses with photos receive 42% more requests for directions and 35% more click-throughs to their website. Your competitor is uploading photos of their work, their team, their shop, their equipment.

Photos serve two purposes. They make your listing more attractive to humans who are deciding between you and three other options. And they signal to Google that your business is real, active, and established.

Low-quality, dark, or blurry photos hurt more than they help. But authentic photos of real work — even taken on a phone — outperform stock photography every time.

**What to do:** Upload at least 10 photos to your GBP listing. Add new ones monthly. Every completed project is a photo opportunity. Take a before shot, an in-progress shot, and an after shot. Upload all three. Name the files descriptively before uploading — "kitchen-remodel-denver-2026.jpg" is better than "IMG_4392.jpg."

## The Compound Effect

Here's what your competitor figured out, maybe without even realizing it: all of these signals compound. Reviews feed prominence. Posts signal activity. Photos increase engagement. Content builds authority. A complete profile ties it all together.

No single action will vault you to the top of Google. But the combination of a complete GBP listing, steady reviews, regular posting, real photos, and a website with useful content creates a flywheel that gets stronger over time.

The gap between you and your competitor isn't talent or quality — it's visibility. And visibility is a system, not a one-time fix.

## The Shortcut That Isn't Really a Shortcut

Everything above works. It also takes time — time you probably don't have because you're running jobs, managing crews, and keeping customers happy.

Platforms like [TracPost](https://tracpost.com) exist specifically for this problem. You take a photo of your work, and the platform handles the rest: writing the caption, posting to social media, publishing a blog post, and updating your Google Business Profile. The signals Google needs to rank you — fresh content, regular photos, active posting — get generated from the work you're already doing.

But whether you automate it or do it manually, the playbook is the same. Completeness, consistency, and proof of work. That's what your competitor is giving Google, and it's why they're showing up instead of you.

---

*Your competitors aren't outworking you. They're just outsignaling you. Start with your Google Business Profile, and build from there — or [let TracPost handle the signals for you](https://tracpost.com).*`
};

// ─── Article 2 ──────────────────────────────────────────────────────────────

const article2 = {
  slug: "your-phone-has-6-months-of-marketing-you-never-posted",
  title: "Your Phone Has 6 Months of Marketing You Never Posted",
  meta_title: "Your Phone Has 6 Months of Marketing Content",
  excerpt: "You take photos of every job. You just never post them. That camera roll is the most valuable marketing asset you're ignoring.",
  content_type: "deep_dive",
  content_pillar: "growth",
  tags: ["social media", "content marketing", "small business", "phone photography", "camera roll"],
  body: `Open your camera roll right now. Scroll back three months. Count the photos of finished jobs, happy customers, your crew working, materials laid out, progress shots. There are dozens. Maybe hundreds.

Now open your Instagram, your Facebook page, your Google Business Profile. Count the posts.

That gap — between the work you document and the marketing you publish — is costing you more than you think.

## The Camera Roll Graveyard

Every trade professional I've talked to does the same thing. They finish a job, pull out their phone, and take photos. Sometimes it's for warranty documentation. Sometimes it's because the work looks good and they're proud of it. Sometimes the customer asks them to.

The photos go into the camera roll. And that's where they die.

Maybe you texted a few to your spouse. Maybe you posted one to your personal Facebook. But the business page? The Google listing? The website? The content never makes it there.

This isn't a motivation problem. It's a workflow problem. There's no natural moment in your day where sitting down to write a caption, pick a hashtag, and publish to three platforms makes sense. By the time you're home, you're tired. By the next morning, you're on to the next job. The moment passes.

## The "I'll Post It Later" Lie

You've told yourself this one. We all have. "I'll batch it on Sunday." "I'll do a bunch of posts this weekend." "I need to set aside time for social media."

It never happens. And here's why: the energy required to post a photo increases exponentially with the time elapsed since you took it. When you're standing on the job site, the caption writes itself. You know the scope, the challenge, the before-and-after story. Two days later, it's just another photo in a scroll of hundreds. Two weeks later, you can't remember which job it was.

There's a window — roughly 24 hours — where a work photo has maximum context and minimum friction. After that, it's archaeology. You're digging through your camera roll trying to reconstruct the story of a job you've mentally moved past.

The Sunday batch session requires you to do the hardest version of the task: pick from hundreds of photos, remember the context for each one, write original captions for content that's no longer fresh in your mind, and do it during the few hours you're supposed to be recharging. No wonder it doesn't happen.

## What Going Dark Actually Costs You

When you stop posting, most business owners think the consequence is neutral — nothing gained, nothing lost. That's wrong. Going dark on social media and Google is an active negative.

Here's what happens when you disappear for three months:

**Your Google ranking drops.** Google's local algorithm factors in recency of activity. A Google Business Profile that hasn't been updated in 90 days gets treated as less relevant than one that posted last week. Your competitor who posts blurry photos with no caption is outranking you because they're at least showing signs of life.

**Your social reach craters.** Instagram and Facebook use engagement-based algorithms. When you stop posting, your followers stop seeing you. When you start again, the algorithm treats you like a new account. You're rebuilding reach from scratch every time you go silent.

**Potential customers can't evaluate you.** When someone finds you through a referral or a Google search, the first thing they do is check your social media. They're looking for recent work, proof you're active, and a sense of who you are. A Facebook page whose last post is from October tells them you might not be in business anymore. It doesn't matter that you're booked three months out — they don't know that.

**Your best marketing moments evaporate.** That stunning kitchen reveal? That customer who was thrilled with the work? The before-and-after that would stop someone mid-scroll? Gone. Buried in your camera roll between screenshots and grocery lists.

## The Gap Between Doing and Showing

Here's the thing that frustrates me about this problem: the hardest part of marketing for a service business is having something worth showing. You already have that. You do interesting, visual, transformation-driven work every single day.

A marketing agency would kill for the raw material sitting in your phone. Before-and-afters. Progress shots. The mess before the masterpiece. The moment the customer sees the finished product. This is the content that performs — real work, real results, no stock photography, no staged scenes.

You have the hardest part handled. The part you're missing — the writing, the formatting, the publishing, the platform logistics — is the easy part. It's also the part that doesn't feel like your job, which is why it never happens.

## What Actually Works

If you're going to do this yourself, here's the only system that works for people who don't have time:

**Post from the job site.** Not later. Not at home. Right there, while the context is fresh. Take the photo, write two sentences about what you did, and post it. It doesn't need to be polished. Authenticity outperforms polish on every platform, especially for trades and service businesses.

**Use one platform to start.** Don't try to manage Instagram, Facebook, Google, and LinkedIn simultaneously. Pick the one where your customers are. For local service businesses, that's almost always Google Business Profile or Facebook. Post there first. Expand later.

**Set a floor, not a ceiling.** Don't aim for daily posting. Aim for twice a week. Two posts per week is 104 pieces of content per year. That's more than 95% of your competitors are doing. The goal isn't to become an influencer — it's to maintain a visible, active presence that tells Google and potential customers you're real and you're working.

**Separate capture from publishing.** If you can't post from the job site, at least tag the photo immediately. Most phones let you favorite or flag photos. Mark the ones worth posting. When you have five minutes — in the truck, waiting for an inspector, between jobs — grab a flagged photo and post it. The flag cuts the decision fatigue.

## The Real Problem is the Workflow

You don't lack content. You don't lack skill. You lack a workflow that respects the reality of your day — which is that you're on a job site with dirty hands and a full schedule, not sitting at a desk with Canva open.

The business owners who manage to stay visible online either have someone doing it for them (an office manager, a spouse, a marketing person) or they've built a habit so automatic it doesn't require decision-making.

This is exactly the problem that [TracPost](https://tracpost.com) was built to solve. You take a photo on your phone — something you're already doing — and the platform writes the caption, creates a blog post, and publishes across your social accounts and Google Business Profile. The workflow starts and ends with the camera shutter. Everything between the photo and the published post is automated.

But even without automation, the principle holds: the closer you can get publishing to the moment of capture, the more likely it is to actually happen. Every hour of delay is friction. Every day of delay is a reason not to bother.

## Your Camera Roll Is a Marketing Department

There are businesses paying agencies thousands of dollars a month for content that isn't as good as what's sitting in your phone right now. Original photography of real work, real transformations, real customer results. That's marketing gold, and you're generating it every day as a byproduct of doing your job.

The only question is whether it stays buried or starts working for you.

---

*Stop scrolling past six months of proof that you're great at what you do. Post it, automate it, or hand it off — but stop letting it rot in your camera roll. [TracPost turns your job-site photos into a full marketing engine](https://tracpost.com) so the work you're proud of actually gets seen.*`
};

// ─── Article 3 ──────────────────────────────────────────────────────────────

const article3 = {
  slug: "google-business-profile-the-free-listing-that-outperforms-your-website",
  title: "Google Business Profile: The Free Listing That Outperforms Your Website",
  meta_title: "Google Business Profile Outperforms Your Website",
  excerpt: "Your Google Business Profile gets seen before your website in almost every local search. Most business owners don't even know it exists.",
  content_type: "authority_overview",
  content_pillar: "growth",
  tags: ["google business profile", "local seo", "google maps", "local search", "small business"],
  body: `When someone in your city searches for the service you provide, Google shows them a map with three businesses listed underneath it — before any website appears in the results. That box is called the Local Pack, and the listings inside it come from Google Business Profile.

Not your website. Not your social media. A free listing on Google that most business owners either don't know about, set up once and forgot, or never claimed at all.

If you run a local service business and you're only paying attention to your website, you're optimizing the wrong thing.

## What Google Business Profile Actually Is

Google Business Profile (GBP) is a free tool from Google that lets you manage how your business appears in Google Search and Google Maps. When someone searches "electrician near me" or "best hair salon in Austin," the results they see in that map section are pulled from GBP listings.

Your listing shows your business name, address, phone number, hours, photos, reviews, website link, and recent posts. It's essentially your business's homepage on Google — and for many local businesses, it gets more views than their actual website.

Think about your own behavior. When you need a plumber, you don't go to plumber-websites.com and browse. You Google "plumber near me," look at the map results, check the reviews, maybe look at a few photos, and call the one that looks most established. Your customers do the same thing.

GBP is where that decision happens. Your website is where they go after they've already chosen you — if they go at all.

## Why GBP Ranks Above Your Website

Google's entire business model is answering questions as fast as possible. For local service queries, the fastest answer is: here are three businesses near you, with phone numbers, ratings, and directions. That answer comes from GBP data, not from crawling websites.

This is why a plumbing company with a basic GBP listing and 50 reviews will show up above a plumbing company with a beautiful website and zero GBP presence. Google is solving for the searcher, and the searcher wants a phone number and proof of quality, not a slick homepage.

The Local Pack (that map with three listings) appears above the regular search results in 93% of local searches, according to multiple industry studies. Below the Local Pack, you'll see the regular website results — what SEO people call the "organic" results. Most searchers never scroll past the Local Pack.

Your website still matters. But your GBP listing is your front door.

## The Fields That Actually Move the Needle

Not every field in your GBP listing carries equal weight. Here's where to focus:

### Primary and Secondary Categories

Your primary category is the single most important ranking factor in local search. Google uses it to determine which searches your business is relevant for. If you're a general contractor and your primary category is set to "Business," you're invisible for every construction-related search.

Choose the most specific category that accurately describes your core service. Then add secondary categories for your other services. A remodeling contractor might use "Remodeling Contractor" as primary, with "Kitchen Remodeler," "Bathroom Remodeler," and "General Contractor" as secondaries.

Google offers over 4,000 categories. Be specific. "Restaurant" is worse than "Italian Restaurant." "Contractor" is worse than "Roofing Contractor."

### Business Description

You get 750 characters. Use them. Describe what you do, who you serve, and where you operate. This isn't the place for marketing slogans — it's the place for clear, keyword-rich description of your services and service area.

"Smith Roofing provides residential and commercial roofing services in the greater Denver metro area, including roof replacement, roof repair, storm damage restoration, gutter installation, and roof inspections. Serving Lakewood, Arvada, Westminster, and surrounding communities since 2008."

That description tells Google exactly what searches to show you for. Compare that to "We're a family-owned business dedicated to quality and customer satisfaction," which tells Google nothing useful.

### Services

GBP lets you list individual services with descriptions and optional pricing. Every service you add creates another signal to Google about what you do. List everything — don't assume Google will figure it out from your category alone.

Each service can have a description up to 300 characters. Use that space. "Complete tear-off and replacement of asphalt shingle roofing systems, including underlayment, flashing, and ridge vent installation" is far more useful than "Roof replacement."

### Photos

Businesses with more than 100 photos receive 520% more calls than the average business, according to Google's own data. That number is extreme, but the trend is real: photos matter enormously.

Upload photos of your completed work, your team, your equipment, your storefront (if applicable), and your process. Real photos only — Google's algorithm can detect and penalize stock photography on GBP listings.

Add new photos regularly. A listing with 200 photos from 2022 and nothing since looks abandoned. A listing with 30 photos from the last three months looks active.

### Posts

GBP Posts are short updates that appear on your listing. They can include text, a photo, and a call-to-action button. Most businesses ignore this feature entirely, which makes it a significant competitive advantage.

Post types include updates, offers, and events. Use them to share completed projects, seasonal promotions, company news, or customer testimonials. Each post is visible for about seven days before it gets pushed down, so posting weekly keeps your listing looking active.

## Reviews: The Ranking Factor You Can Influence

Reviews are the most powerful ranking signal you have direct influence over. Google's local algorithm considers:

- **Total review count.** More is better, but there's no magic number. Having 15 more reviews than your nearest competitor is more meaningful than having 500 total.
- **Average rating.** Obvious, but worth noting: a 4.7 with 80 reviews outperforms a 5.0 with 6 reviews. Volume matters.
- **Review velocity.** How often you're getting new reviews. Three reviews this month signals more than 30 reviews that all came in two years ago.
- **Review content.** When customers mention specific services or locations in their reviews, those become ranking signals. A review that says "Smith Roofing did an amazing roof replacement on our home in Lakewood" is an SEO asset.
- **Response rate.** Google tracks whether you respond to reviews. Responding to every review — positive and negative — signals engagement and professionalism.

**How to get more reviews:** Ask at the moment of satisfaction. Send a direct link (you can find this in your GBP dashboard under "Ask for reviews"). Text it, email it, or hand them a card with a QR code. Make it one tap to leave a review, not a scavenger hunt.

## The 3-Pack: How to Get In

The Local Pack shows three results. Getting into the top three for your primary service in your city is the single most valuable position in local search. Here's what determines who gets in:

**Relevance.** How well your listing matches the search query. This comes from your categories, services, description, and the content of your reviews and posts.

**Distance.** How close your business is to the searcher. You can't change your location, but you can optimize your service area to make sure Google knows every city and neighborhood you serve.

**Prominence.** How well-known and trusted your business is. This comes from reviews, citations (mentions of your business on other websites), your website's authority, and your overall online presence.

You can't control distance. But relevance and prominence are entirely within your reach. A complete listing with good reviews, regular posts, fresh photos, and accurate categories maximizes both.

## The "Last Updated" Signal

Google tracks when your listing was last updated. Every new photo, post, review response, or information change sends a signal that your business is active. Listings that haven't been touched in months get pushed down in favor of listings that show regular activity.

This is why "set it and forget it" doesn't work with GBP. Claiming your listing is step one. Keeping it alive is the ongoing work that separates businesses on page one from businesses on page three.

## Automating the Ongoing Work

The setup work — claiming your listing, choosing categories, writing your description, adding services — is a one-time effort. The ongoing work — posting updates, adding photos, responding to reviews, keeping information current — is where most businesses fall off.

[TracPost](https://tracpost.com) automates the ongoing part. When you take a photo of a completed job, the platform creates a GBP post with a caption, publishes it to your listing, and keeps your profile active without you logging into Google. It also monitors and syncs your reviews across platforms, so you can see and respond to everything in one place.

But even without automation, the priority is clear: your Google Business Profile deserves more attention than your website. It's free, it's where your customers find you, and it's the single highest-leverage marketing asset a local business can have.

---

*Your Google Business Profile isn't a nice-to-have. It's the front door of your business for anyone searching Google. Claim it, complete it, keep it active — or [let TracPost keep it active for you](https://tracpost.com).*`
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

  const articles = [article1, article2, article3];

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
