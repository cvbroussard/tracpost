#!/usr/bin/env node
/**
 * Seed three SEO-targeted marketing blog articles (batch 8) for TracPost's own blog.
 * Stage 6 -- advocacy/referral content. Reader is a happy subscriber (2+ months)
 * seeing results. These articles give them a reason to share TracPost with peers,
 * and give those peers a warm entry point.
 * No pricing. 700-900 words. Confident, grounded tone.
 *
 * Usage:
 *   node scripts/seed-marketing-blog-batch8.js
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

// ─── Article 22: What Our Subscribers Stopped Doing ─────────────────────────

const article22 = {
  slug: "what-our-subscribers-stopped-doing-and-what-happened-next",
  title: "What Our Subscribers Stopped Doing (and What Happened Next)",
  meta_title: "What Our Subscribers Stopped Doing (and What Happened Next) | TracPost",
  excerpt: "The biggest gains our subscribers report do not come from doing more. They come from stopping -- the nightly caption writing, the app juggling, the agency invoices. Here are the patterns we see across businesses that let the system take over.",
  content_type: "deep_dive",
  content_pillar: "growth",
  tags: ["tracpost results", "content automation results small business", "tracpost subscriber results", "social media automation before after", "marketing automation results", "tracpost review"],
  body: `We talk to our subscribers constantly. We watch their dashboards, review their content pipelines, and track what happens across their connected platforms. And after seeing hundreds of businesses go through the first few months, a pattern has emerged that we did not expect.

The biggest improvements do not come from doing more. They come from stopping.

Not stopping marketing -- stopping the parts of marketing that were eating their time without producing results. Here is what that looks like in practice.

## They Stopped Logging Into Five Apps to Post

Before TracPost, most of our subscribers had the same routine. Open Instagram. Write something. Open Facebook. Copy-paste it. Open Google Business Profile. Try to remember what you posted last week. Check LinkedIn. Feel guilty about LinkedIn. Close LinkedIn.

Five apps, five logins, five slightly different formats, five chances to get distracted, five opportunities to say "I will do it later" and never come back.

After the platform took over, something interesting happened. They stopped thinking about platforms entirely. Content started appearing across all of their connected accounts -- formatted correctly for each one, timed for each audience, consistent in voice but adapted in format. They did not consolidate their posting into one app. They eliminated posting as a task altogether.

The result was not just time saved. It was coverage they never had before. Most of our subscribers were active on two or three platforms at best. Now they have a presence across every platform that matters for their business, including the ones they had been neglecting.

## They Stopped Writing Captions at 11pm

This one comes up in almost every conversation. The nightly ritual: kids are in bed, the day is finally over, and now it is time to figure out what to say about that bathroom remodel photo from Tuesday. Thirty minutes of staring at a phone screen, trying to sound professional but not stiff, interesting but not try-hard. Posting something mediocre because it is midnight and they have a 6am start.

That stopped. Content publishes while they are on the job site, during the hours their audience is actually online. The captions match their voice because the platform learned how they talk about their work. And nobody is losing sleep over hashtag strategy anymore.

The quality went up because the process was no longer competing with exhaustion. The consistency went up because it stopped depending on willpower.

## They Stopped Letting Photos Die in the Camera Roll

Every contractor, every landscaper, every detailer, every tradesperson -- they all have the same graveyard. Hundreds of project photos sitting in their camera roll, never posted, never used, slowly buried under screenshots and grocery lists.

Once the platform started turning uploaded photos into content automatically, something shifted. Subscribers started capturing more because they knew the photos would actually become something. The friction between "take the photo" and "get value from the photo" collapsed to almost zero.

And then the calls started. "I saw your work online." "I saw that kitchen you posted." Customers were finding them through content made from photos that would have sat in a camera roll forever.

## They Stopped Paying an Agency to Post Stock Photos

This is a sore subject for a lot of our subscribers. They spent months -- some of them years -- paying a marketing agency that posted generic stock photos with generic captions on a generic schedule. The agency had never seen their work. The content looked like it could belong to any business in any city.

When they switched to TracPost, the content started coming from their actual projects, their actual job sites, their actual completed work. The difference was immediately visible. Followers could tell. Customers could tell. The subscribers could tell.

The authenticity was not a style choice. It was structural. The platform only works with real content from real work. There is no stock photo library. There is no template bank of generic captions. Everything is built from what the business actually does, which means everything looks and sounds like them.

## They Stopped Worrying About Their Google Business Profile

Google Business Profile might be the most neglected marketing asset in local business. Everyone knows it matters. Almost nobody keeps it current. The last post is from eight months ago. The photos are from the original setup. It sits there, technically active but practically dormant, while the business does great work that nobody online can see.

TracPost treats GBP as a first-class platform. Fresh posts, current project photos, local keyword optimization -- all running automatically. Subscribers who had not touched their profile in months suddenly had an active, current presence in local search. Several have told us their profile views doubled within weeks of the platform taking over.

## They Stopped Wondering if Marketing Was Worth It

This is the big one. The existential question that haunts every business owner who has tried marketing and been burned: is any of this actually doing anything?

When search rankings start climbing -- and they can see it in their dashboard -- the question answers itself. When profile views increase, when website traffic from organic search ticks up, when a new customer says "I found you on Google" -- the doubt dissolves.

Not because of one dramatic moment, but because of accumulation. Weeks of consistent content, across every platform, building on itself. The compound effect that never had a chance to work before because consistency was always the thing that broke down.

## The Pattern

Look at that list again. Nobody added a skill. Nobody learned a new platform. Nobody carved out more hours in their week. They subtracted. They removed the manual work, the app juggling, the late-night caption writing, the agency middleman, the GBP guilt, the existential doubt.

And what replaced it was not more effort in a different direction. It was a system that runs on the work they were already doing -- capturing photos of their projects. The input stayed the same. The output transformed.

That is the engine. Not more work. Less work, better results. Every subscriber finds it in their own time, but they all arrive at the same realization: the best marketing strategy they ever had was the one they stopped managing themselves.

---

*Know someone who is still doing it the hard way? Send them this article. They will recognize themselves in every paragraph.*`
};

// ─── Article 23: How to Tell if Your Marketing Is Actually Working ───────────

const article23 = {
  slug: "how-to-tell-if-your-marketing-is-actually-working",
  title: "How to Tell if Your Marketing Is Actually Working",
  meta_title: "How to Tell if Your Marketing Is Actually Working | TracPost",
  excerpt: "Likes and followers feel good but they do not pay the bills. Here are the metrics that actually predict whether your marketing will generate business -- and the 60-90 day lag that causes most business owners to quit right before it starts working.",
  content_type: "authority_overview",
  content_pillar: "growth",
  tags: ["is my marketing working", "how to measure marketing small business", "marketing ROI small business", "small business marketing metrics", "marketing results timeline", "google business profile insights"],
  body: `Three months into a marketing effort, every business owner asks the same question: is this actually working?

It is a fair question. You have been feeding the machine -- uploading photos, watching content go out across your platforms, seeing your profiles stay active. But the phone is not ringing off the hook. Your calendar is not suddenly overbooked. So what gives?

The answer usually is not that your marketing is failing. It is that you are measuring the wrong things, or measuring the right things at the wrong time. Here is how to tell what is actually happening.

## The Metrics That Do Not Matter (Much)

Let us get these out of the way because they are the ones most people check first.

Follower count. It feels important. A bigger number feels like progress. But followers are not customers. A local plumber with 340 followers who all live in their service area will outperform a plumber with 5,000 followers scattered across the country every single time. Stop watching this number.

Likes and reactions. Social proof has some value, but a liked post is not a booked job. Engagement metrics tell you whether content is resonating with the people who already follow you. They tell you almost nothing about whether new customers are finding you.

Impressions. How many people saw your post. This is the emptiest number in marketing. Saw it and did what? Scrolled past it, mostly. Impressions measure reach, not impact. They are the "calories burned" counter on a treadmill -- technically a measurement, practically meaningless for predicting outcomes.

These are vanity metrics. They look good in a report. They feel good to track. They do not predict revenue.

## The Metrics That Actually Predict Business

Here is where to look instead. These are the leading indicators -- the signals that show up before the phone rings.

**Search visibility.** Are you appearing in more searches than you were 90 days ago? Google Search Console is free and shows you exactly which queries bring up your website, how often, and what position you rank in. If your average position is improving and your total impressions in search are climbing, your marketing is working. You are becoming more findable.

**Google Business Profile views.** Open GBP Insights. Look at how many people viewed your profile this month versus three months ago. This is one of the most direct indicators of local marketing effectiveness because GBP is where most local customers make their decision. More views means more people are considering you. If this number is climbing, you are on the right trajectory.

**Website traffic from organic search.** Not direct traffic -- that is people typing your URL. Not referral traffic -- that is people clicking links from other sites. Organic search traffic. These are people who searched for something you do, in your area, and Google sent them to you. This is the metric that connects your content to actual discovery.

**Customer source tracking.** This is the most important metric and the one almost nobody tracks systematically. When a new customer calls, how did they find you? "I found you online" is the answer you are listening for. Ask every new customer. Write it down. Track it over time. If the percentage of customers who found you through search is increasing, everything is working.

**Review velocity.** More visibility leads to more customers leads to more reviews. If your review count is growing faster than it was six months ago, the flywheel is turning. Reviews feed rankings, rankings feed visibility, visibility feeds customers, customers feed reviews.

## The Lag That Kills Most Marketing Efforts

Here is the part that nobody warns you about, and it is the reason most business owners quit marketing right before it starts paying off.

Marketing results lag effort by 60 to 90 days. The content you published in January is not ranking in January. Google needs to crawl it, index it, evaluate it against competing content, and gradually adjust your position. That process takes weeks. Sometimes months for competitive keywords.

This means there is a window -- roughly month two through month four -- where you have been putting in effort but the scoreboard has not moved yet. This is when doubt creeps in. This is when the "is this working?" question gets loudest. This is when most people stop.

And stopping at month three is the most expensive decision in marketing because you have already paid the cost. The content exists. The signals are accumulating. The compounding is about to start. Quitting here means you paid the full price of the runway but never took off.

## What the Dashboard Is Telling You

TracPost's analytics dashboard tracks the signals that matter -- search visibility trends, profile engagement, platform performance, content pipeline health. But even without it, you can read the story yourself.

Open Google Search Console. Look at total clicks and impressions over the last six months. Is the trend line going up, even slowly? That is your answer.

Open your GBP Insights. Compare this quarter to last quarter. More profile views? More direction requests? More phone calls from the listing? That is your answer.

Think about the last ten customers you booked. How many mentioned finding you online? One? Three? If that number is higher than it was a year ago, the system is working.

## The Reframe

Marketing is not a light switch. It is a furnace. You feed it fuel, the temperature rises gradually, and one day you realize the house is warm. If you are consistently feeding the engine -- uploading project photos, keeping your profiles active, publishing to the platforms that matter -- and your search visibility is trending upward, the phone calls are coming.

They are lagging, not missing. The content you are building today is the foundation for the customers you will book in 90 days. The subscribers who understand this are the ones who build unstoppable businesses. They stopped asking "is it working?" and started watching the leading indicators that told them the answer was already yes.

---

*Want to see your actual search performance trends? [Log in to your dashboard](https://tracpost.com) -- the analytics tab shows you exactly where you stand and where the trajectory is pointing.*`
};

// ─── Article 24: The Businesses That Grow Fastest All Have One Thing in Common ─

const article24 = {
  slug: "the-businesses-that-grow-fastest-all-have-one-thing-in-common",
  title: "The Businesses That Grow Fastest All Have One Thing in Common",
  meta_title: "The Businesses That Grow Fastest All Have One Thing in Common | TracPost",
  excerpt: "It is not a better logo or a bigger ad budget. The fastest-growing local businesses all share one habit that separates them from everyone else -- and most of them do not even realize it is their competitive advantage.",
  content_type: "deep_dive",
  content_pillar: "growth",
  tags: ["how to grow my business fast", "what fast growing businesses do differently", "business growth strategy", "local business growth", "documentation habit business", "content flywheel small business"],
  body: `We have watched hundreds of local businesses come through TracPost at this point. Contractors, landscapers, detailers, remodelers, painters, trades of every kind. Some grow steadily. Some plateau. And some take off -- the kind of growth where they are hiring, expanding their service area, and turning down work they would have fought for a year ago.

The businesses in that last category all share something. It is not a bigger marketing budget. It is not a better logo. It is not some secret advertising channel that nobody else knows about.

They document their work.

## Not a Content Strategy -- a Documentation Habit

The distinction matters. These businesses are not sitting down on Sunday nights to plan their content calendar for the week. They are not thinking about marketing when they pull out their phone on a job site. They are documenting.

The foreman walks through a project before demo starts and takes photos because he wants a record of existing conditions. The painter photographs the prep work because she learned the hard way that customers forget what the walls looked like before. The landscaper shoots a video walkthrough of the completed yard because the homeowner wants to show their spouse.

None of this is marketing behavior. It is operational behavior. It is the same instinct that makes a good tradesperson take notes, keep records, and cover their bases. The documentation exists because it serves the business first.

The magic happens when that documentation meets a system.

## What Documentation Becomes

Take those operational photos and run them through a platform that understands content. Here is what happens to each one.

The pre-demo walkthrough becomes a before photo. Pair it with the completion shot and you have a transformation post -- the single most engaging content format in service business marketing. That one paired set becomes an Instagram carousel, a Facebook post, a Google Business Profile update, and a blog article. Four platforms, one pair of photos you took for your own records.

The progress photos from mid-project become behind-the-scenes content. Followers love process shots. They stop scrolling because the mess and the work feel authentic in a way that polished final photos never do. That quick photo of the framing stage was not taken for Instagram. But it performs better on Instagram than anything a marketing agency would have staged.

The completion walkthrough video -- the one the homeowner asked for -- becomes a reel. It becomes a YouTube short. It becomes a testimonial setup. A 45-second walk through a finished basement that was shot as a courtesy to the customer turns into content that reaches thousands of potential customers.

The warranty documentation photos -- the ones taken for protection in case of a callback -- become detail shots that showcase craftsmanship. Close-ups of joinery, tile work, paint edges, material transitions. Content that positions the business as premium without ever saying the word.

None of these photos were taken for marketing. All of them became marketing.

## The Flywheel Nobody Plans

Here is what happens when documentation meets distribution, compounded over months.

Great work gets done. That is the starting point -- and it is the part these businesses already have dialed in. They are good at what they do. That was never the problem.

The work gets documented. Not as a marketing task, but as a business practice. Photos of conditions, progress, completion. Notes on materials, challenges, solutions. This happens naturally because it serves the operation.

The documentation becomes visible. A system -- TracPost, in this case -- takes the raw documentation and turns it into platform-ready content. Formatted for each channel, timed for each audience, captioned in the business's voice. Published automatically, consistently, across every platform that matters.

Visibility drives more work. Search rankings improve. Google Business Profile stays active and current. Social platforms show a business that is busy and producing quality results. New customers find the business through search, see proof of the work, and make contact.

More work means more documentation, which means more visibility, which means more work. The flywheel spins faster with each rotation. Not because anyone is pushing harder, but because the system feeds itself.

Great work. Documented work. Visible work. More work.

That is the cycle. And the businesses that grow fastest are the ones running it, whether they planned to or not.

## Why Most Businesses Miss It

The gap is not talent. The gap is not even effort. The gap is the connection between "documented" and "visible."

Most business owners have the photos. They are sitting in camera rolls, in job folders, in cloud drives organized by address. The documentation exists. But there is no bridge between having those photos and having them work for the business. So they sit there.

The businesses that grow fastest found the bridge. They connected their documentation habit to a distribution system that does the translation -- from raw job photos to published, platform-optimized content -- without adding work to their day.

They did not become marketers. They stayed tradespeople. They just let a system turn the proof of their work into the visibility their work deserves.

## The Realization

Here is the moment we see over and over with our subscribers, usually somewhere around month three. They look at their social profiles, their Google rankings, their website traffic, and they realize something.

They did not change what they do. They take the same photos they always took. They do the same quality work they have always done. The only thing that changed is that the documentation they were already creating is now being turned into marketing automatically.

The best part: this is not a hack. It is not a trick. It is not something that works for six months and then stops. It is a structural advantage that compounds over time. Every project documented is another piece of content. Every piece of content is another signal to search engines. Every improved ranking is another potential customer.

The businesses that grow fastest did not find a better marketing strategy. They found a system that turned their existing habits into a growth engine. The documentation was already there. The quality work was already there. The only missing piece was the system that connected the two.

If you are reading this and thinking "I already take photos of everything" -- you are closer than you think. The flywheel is not built from scratch. It is activated. The work and the documentation are the hard parts, and you already have those. The system that turns them into growth is the easy part.

---

*Know a business owner who takes great photos but never posts them? They are one connection away from a flywheel they do not know they are sitting on. Send them this article.*`
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

  const articles = [article22, article23, article24];

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
