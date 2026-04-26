#!/usr/bin/env node
/**
 * Seed three SEO-targeted marketing blog articles (batch 7) for TracPost's own blog.
 * Stage 5 — post-decision reinforcement. Reader just signed up or is in first week.
 * Reduces buyer's remorse + acts as SEO content for prospects.
 * No pricing. 700-900 words. Soft CTAs only.
 *
 * Usage:
 *   node scripts/seed-marketing-blog-batch7.js
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

// ─── Article 19: Your First Week on TracPost ──────────────────────────────────

const article19 = {
  slug: "your-first-week-on-tracpost-what-to-expect",
  title: "Your First Week on TracPost: What to Expect",
  meta_title: "Your First Week on TracPost: What to Expect | TracPost",
  excerpt: "You connected your accounts. Now what? Here is a day-by-day look at what happens behind the scenes during your first week -- from brand playbook to first published posts -- so you know exactly what to expect.",
  content_type: "deep_dive",
  content_pillar: "growth",
  tags: ["tracpost getting started", "tracpost first week", "tracpost onboarding", "social media automation setup", "content automation first week", "what to expect tracpost"],
  body: `You signed up. You connected your accounts. You uploaded a logo and answered a few questions about your business. Now you are sitting there wondering if something is supposed to happen.

It is. And it already started. Here is what your first week actually looks like -- day by day, behind the scenes and on the surface.

## Day 1: The Platform Learns Your Business

The moment you finish connecting your accounts, something starts that you will not see. The platform is building your brand playbook -- a living document that shapes every piece of content it creates for you. It analyzes your business type, your service area, your industry, the way you describe your work. If you have existing posts on your connected accounts, it studies those too, picking up tone, vocabulary, and the kinds of projects you highlight.

This is not a template. It is not "contractor voice" or "restaurant voice" applied from a dropdown menu. It is a custom profile built from what your business actually is, where you operate, and how you talk about your work.

You will not see the playbook being built. You might feel like nothing is happening. That is normal. The foundation matters more than speed here, and the platform is being deliberate about getting your voice right before it starts speaking for you.

## Day 2-3: Upload Your First Photos

This is the only thing the platform needs from you, and it is simpler than you think. Open the app, take a few photos of recent work, and upload them. Five to ten photos from your last couple of jobs is plenty to start. If you have a backlog on your phone -- finished projects, before-and-afters, detail shots -- even better. Upload those too.

You do not need to write anything. You do not need to sort them or tag them or think about which platform they belong on. If you want to add a quick voice note or a sentence of context -- "just finished this deck in Fishtown, cedar with hidden fasteners" -- that helps. But it is optional.

What happens next is the triage step. The platform scores each photo for quality, identifies what is in the image, and flags content opportunities. A strong before-and-after pair gets flagged for a transformation post. A detail shot of craftsmanship gets flagged for a close-up showcase. A team photo gets flagged for a culture post. You uploaded raw material. The platform sees the content inside it.

## Day 3-4: First Posts Start Appearing

This is when it gets real. Check your Instagram. Check your Facebook page. Check your Google Business Profile. Posts are going out -- and they look like someone who knows your business wrote them.

Not one generic caption blasted everywhere. Each platform gets content formatted for how that platform works. Instagram gets a visual-first caption with relevant hashtags. LinkedIn gets a professional angle on the same project. Your Google Business Profile gets a local-keyword-rich update that starts building your search visibility immediately. Your blog queue starts forming with article drafts targeting searches that people in your area are actually typing.

You did not write any of it. You did not choose hashtags or crop images or think about character limits. You took photos of your work. The platform handled everything between the camera roll and the published post.

## Day 5-7: The Rhythm Establishes

By the end of your first week, something shifts. You stop checking whether posts went out because you already know they did. Your social profiles have a pulse. Your Google Business Profile -- which may have been dormant for months -- is suddenly active with real project photos and local content. Anyone who looks you up sees a business that is busy and doing good work.

The rhythm is the point. Not any single post, but the consistency. The fact that content is going out regularly, across every platform, without you scheduling anything or writing anything or remembering to log in.

Your job from here is simple: keep capturing photos of your work. That is it. The more fuel you give the engine, the more it produces. A few photos a week is enough to maintain a strong presence across every platform. If you are the type to snap photos throughout the day, even better -- the platform will never run out of material to work with.

## The Quiet Part

Here is the thing nobody tells you about the first week: it might feel underwhelming. You expected fireworks. Instead, you got a few posts on your Instagram and an active Google Business Profile. That does not feel like a revolution.

But think about what actually happened. In seven days, you went from dormant profiles and good intentions to an active, consistent presence across every platform that matters for your business. You did it by taking photos -- something you were probably already doing. You did not hire anyone. You did not learn a new skill. You did not carve out hours for marketing.

The compound effect has not kicked in yet. That takes weeks. The search visibility improvements take months. The phone call from someone who says "I found you online" is coming, but not this week.

What happened this week is simpler and more important: you built a system that runs without you. Every photo you capture from here adds to it. The platform gets sharper about your voice, smarter about what works on each platform, and more effective at turning your work into the visibility your business needs.

The first week is not the payoff. It is the ignition. The engine is running now. Your only job is to keep feeding it.

---

*Have questions about what you are seeing in your first week? [Reach out](https://tracpost.com) -- we are happy to walk through your account and show you what is happening behind the scenes.*`
};

// ─── Article 20: The 10 Photos That Will Transform Your Online Presence ───────

const article20 = {
  slug: "the-10-photos-that-will-transform-your-online-presence",
  title: "The 10 Photos That Will Transform Your Online Presence",
  meta_title: "The 10 Photos That Will Transform Your Online Presence | TracPost",
  excerpt: "Not all photos are created equal. These ten specific types of images work across every service industry -- and each one unlocks a different kind of content that builds trust, demonstrates expertise, and drives new business.",
  content_type: "authority_overview",
  content_pillar: "growth",
  tags: ["what photos to post for business", "best photos for business social media", "service business photography", "social media photos small business", "business photo ideas", "content photography tips"],
  body: `You know you should be posting photos of your work. But when you open your camera at a job site, you freeze. What exactly should you be capturing? The finished product? The team? The mess?

The answer is all of it -- but not randomly. There are ten specific types of photos that consistently produce the best content, drive the most engagement, and build the strongest online presence. Each one serves a different purpose, and together they tell a complete story about your business.

Here are the ten photos worth capturing, why each one works, and what the platform turns them into.

## 1. The Before

The setup shot. The torn-up kitchen before demolition starts. The overgrown yard before your crew touches it. The faded paint, the broken fence, the cluttered space.

Before photos are half of the most powerful format in service business marketing: the transformation. Without a before, your finished work is just a nice photo. With a before, it is proof of what you can do. A landscaper's before shows a neglected backyard. A detailer's before shows a trashed interior. A baker's before shows raw ingredients on a counter. Every industry has a before -- capture it first.

## 2. The Messy Middle

This is the one most people skip, and it is a mistake. The half-demolished bathroom. The engine pulled out of the bay. The dough mid-knead with flour everywhere. The messy middle is authenticity in a single frame.

It shows that real work is happening. It shows process. It humanizes your business in a way that polished final shots never can. Followers stop scrolling on mess because it feels real. The platform turns these into behind-the-scenes content that builds trust.

## 3. The Reveal

The money shot. The finished kitchen with the lights on. The freshly striped parking lot from above. The wedding cake on the table. This is the photo you are probably already taking -- the hero image that shows what your business delivers.

Make it count. Clean the space, get the lighting right, and take three versions from different angles. This single image becomes the centerpiece of transformation posts, portfolio content, and blog header images across every platform.

## 4. The Detail Close-Up

Zoom in. The grain of the hardwood you just installed. The weld bead on a custom fabrication. The piping detail on a cake. The stitching on an upholstery job. Close-ups communicate craftsmanship in a way that wide shots cannot.

These photos tell your audience that you care about the details -- and they signal expertise to anyone evaluating your work. The platform uses close-ups for carousel posts, blog illustrations, and Pinterest content where detail photography performs exceptionally well.

## 5. The Team in Action

Not posed. Not everyone staring at the camera with their arms crossed. Your crew actually working -- carrying materials, measuring, operating equipment, focused on the task. Action shots show capability and scale.

A roofer's crew moving shingles up a ladder. A salon stylist mid-cut with full concentration. A mechanic under a lift with tools in hand. These images build confidence that there are real, skilled people behind your business. Upload these and the platform turns each one into content across every connected platform.

## 6. The Happy Client Moment

The homeowner's face when they see the finished basement. The dog owner picking up their freshly groomed pup. The restaurant patron's reaction to a plated dish. These moments are gold because they are emotional proof that your work delivers.

You do not need a professional photographer. A quick candid shot -- with permission -- of genuine reaction is more powerful than any staged testimonial. This becomes social proof content that resonates more than any review you could paste into a graphic.

## 7. The Tool, Material, or Ingredient

What you work with says as much about you as what you produce. The specific tile you selected for a backsplash. The commercial-grade equipment in your shop. The high-end paint brand on your shelf. The fresh produce delivered this morning.

These photos position you as an expert who is intentional about materials and methods. They differentiate you from competitors who use the cheapest option available. The platform turns these into educational content that builds authority.

## 8. The Problem You Solved

The water damage before you remediated it. The electrical panel that was a fire hazard. The tree root cracking the foundation. The pest infestation before treatment.

Problem photos are powerful because they create narrative tension. Your audience sees the problem and immediately wants to see the solution. This format drives engagement because people share cautionary content -- "check your house for this" -- and your business is the expert who fixed it.

## 9. The Unexpected Angle

Aerial shots from a drone. A macro lens on a surface texture. A time-lapse frame showing progress. A night shot of exterior lighting you installed. These are the photos that stop the scroll because they show familiar work from an unfamiliar perspective.

You do not need expensive equipment. Most phones shoot decent overhead video. A simple phone macro lens costs almost nothing. The point is breaking the pattern of eye-level, straight-on photos that every competitor posts.

## 10. The "We Were Here" Shot

Your van parked at the job site. Your team in branded shirts. Your sign on the building. Your sticker on the equipment. These photos do not show the work itself -- they show your business in the world, active and present.

They build brand recognition over time. When someone sees your wrapped truck parked in their neighborhood three times in a month, and then sees the same truck in their Instagram feed, the connection is instant. The platform uses these for local-presence content that reinforces your footprint in your service area.

## The System Behind the Photos

Each of these ten photo types unlocks different content. A before-and-after pair becomes a transformation carousel on Instagram and a case study on your blog. A detail close-up becomes a Pinterest pin and a craftsmanship highlight on LinkedIn. A team action shot becomes a culture post on Facebook and a recruitment signal on LinkedIn.

You do not need to think about any of that. Your job is to capture the ten types. The platform handles what each one becomes, where it goes, and when it publishes. The richer the variety of photos you upload, the more diverse and engaging your content becomes across every platform.

Start with the next job. Capture the before. Snap the messy middle. Get the detail close-up. Photograph the reveal. Ten photos, ten types, and your online presence transforms from dormant to undeniable.

---

*Already a subscriber? Upload your next batch with these ten types in mind and watch what the platform produces. Not on board yet? [See how it works](https://tracpost.com).*`
};

// ─── Article 21: Why Your Competitors Will Notice Before Your Customers Do ────

const article21 = {
  slug: "why-your-competitors-will-notice-before-your-customers-do",
  title: "Why Your Competitors Will Notice Before Your Customers Do",
  meta_title: "Why Your Competitors Will Notice Before Your Customers Do | TracPost",
  excerpt: "You have been posting consistently for three weeks and the phone is not ringing off the hook. That does not mean it is not working. The first people who notice your new online presence are not customers -- they are competitors. Here is why that matters and what happens next.",
  content_type: "deep_dive",
  content_pillar: "growth",
  tags: ["does social media work for small business", "how long until social media works", "social media ROI timeline", "when will social media generate leads", "social media patience", "content marketing timeline"],
  body: `Three weeks in. Your posts are going out consistently. Your Google Business Profile is active. Your blog has new articles. Your social feeds look like someone is actually running them.

But the phone is not ringing any differently. No flood of new leads. No "I saw you on Instagram" conversations. The impulse creeps in: is this even working?

It is. But the first people who notice are not who you expect.

## Your Competitors See It First

The first people who register your new online presence are the other businesses in your market. They follow the same hashtags. They monitor the same local search results. They see your posts in their feed because the algorithm shows them content from adjacent businesses.

A remodeler in your area sees your Instagram suddenly active with real project photos three times a week. A competing landscaper notices your Google Business Profile is showing up in local search results with fresh content. A rival salon sees your blog articles starting to rank for the same keywords they target.

They notice because they are watching. They are in the same ecosystem, looking at the same platforms, tracking the same competitive landscape. When a dormant competitor suddenly comes alive, it registers immediately.

This is not a vanity metric. When competitors notice you, it means your presence has crossed a visibility threshold. You are showing up where it matters. The audience that finds you next -- actual customers -- uses the same platforms and the same search results. If your competitors can see you, your customers can too. They just take longer to act on it.

## Why Customers Take Longer

The customer journey for a service business is not linear, and it is almost never fast. Someone does not see your Instagram post on Tuesday and call you on Wednesday. The real path looks more like this:

They have a vague need. Maybe their kitchen is dated. Maybe their yard is embarrassing. Maybe they know they need a new accountant but have not started looking. They are not searching yet -- they are just aware.

Then a trigger happens. A neighbor gets their kitchen done. A friend posts about their new landscaping. Tax season approaches. Now they start looking.

They Google it. Your blog article shows up. They click, skim, and leave. They did not bookmark your site or write down your name. But your business registered somewhere in the back of their mind.

A week later, they are scrolling Instagram and see one of your posts. They recognize the name -- maybe not consciously, but it feels familiar. They tap your profile and scroll through your recent work. They do not call yet.

Two weeks later, a friend mentions they need the same service and asks if anyone knows someone good. They remember your name now. Or they Google again, and this time your Google Business Profile appears with recent photos and reviews. They call.

When you ask how they found you, they say "a friend recommended you." And that is partially true -- the friend confirmed a decision they had already started making based on content they saw weeks ago.

## The Attribution Problem

This is the part that drives business owners crazy. The customer attribution you get is almost always wrong.

People say "referral" when they mean "I Googled you and then asked someone if they had heard of you." They say "I drove past your shop" when they mean "I saw your posts three times before I noticed your sign." They say "word of mouth" when they mean "someone mentioned your name and I already knew it from seeing your content."

The content you are publishing is doing work that never gets credited. It is building familiarity, establishing credibility, and creating the conditions where a referral actually converts instead of getting ignored.

Think about it from the customer's side. Someone recommends a contractor. You Google the name. If their Instagram has not been updated in six months and their website looks abandoned, that referral loses its power. But if their profiles are active, their work is visible, and their blog has recent articles about exactly the kind of project you need -- the referral just became a done deal.

That is what consistent content does. It does not replace referrals. It makes every referral more effective.

## The Compounding Timeline

Here is the honest timeline, because you deserve to know what you are building toward.

Month one is largely invisible. The content is publishing, the search engines are indexing, your profiles are active. But the compound effect has not started yet. This is the month where most people quit if they are doing it manually -- which is exactly why most of your competitors have dormant profiles.

Month two, you start seeing signals. Website traffic ticks up. Your Google Business Profile insights show more views and more direction requests. You might get a comment on a post from someone who is not a friend or family member. These are leading indicators.

Month three is typically when the first direct attribution happens. Someone says they found you online. It might be one call. It might be two. It does not feel like a flood. But that one call represents the tip of an iceberg -- for every person who tells you how they found you, there are several more who saw your content and have not acted yet.

Month six is where it gets undeniable. The search rankings have compounded. The social proof has accumulated. The blog has enough articles to capture a meaningful range of search queries. The profiles have enough history that the algorithm favors your content. You are not wondering if it works anymore because the evidence is in your call log.

## The Engine Is Running

The hardest part of any long-term strategy is the gap between starting and seeing results. Your competitors are already seeing you. Your customers are next -- they just move slower because their journey has more steps.

The content that [TracPost](https://tracpost.com) is publishing for you right now is not just filling feeds. It is indexing in search engines. It is building familiarity with people who will need you in three months. It is creating the conditions where every referral, every Google search, every "do you know someone who does this" conversation tips in your favor.

You cannot see most of this happening. But your competitors can. And that should tell you everything you need to know about whether it is working.

---

*Wondering what your first few months of data look like? [Reach out](https://tracpost.com) -- we will walk you through your analytics and show you the leading indicators that precede the phone calls.*`
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

  const articles = [article19, article20, article21];

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
