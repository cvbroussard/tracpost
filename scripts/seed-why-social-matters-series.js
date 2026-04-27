#!/usr/bin/env node
/**
 * Seed the "Why Social Matters" 5-part marketing series for the TracPost blog.
 *
 * Arc:
 *   1. Origin of human social behavior — why business has always been social
 *   2. How social networks were actually built — the trojan horse of "free"
 *   3. The reach hierarchy — honest numbers per platform
 *   4. Platform fit by industry — where customers actually live
 *   5. The compounded math — TracPost makes the "pick one" era over
 *
 * Each article is saved as draft for operator review before publishing.
 * Skips any article whose slug already exists.
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL);

const articles = [
  // ─── 1. HUMANS ARE NOT LONE WOLVES ────────────────────────────────────────
  {
    slug: "humans-are-not-lone-wolves-business-has-always-been-social",
    title: "Humans Are Not Lone Wolves: Why Business Has Always Been Social",
    meta_title: "Why Business Has Always Been Social (and Always Will Be)",
    excerpt: "Social platforms aren't a fad. They're the modern village square — and humans have been gathering in village squares for two hundred thousand years.",
    content_type: "authority_overview",
    content_pillar: "growth",
    body: `Watch a coffee shop for ten minutes. Half the people are alone, hunched over a laptop or phone. The other half are in pairs or groups, leaning in, laughing, occasionally showing each other something on a screen.

Both groups are doing the same thing. They're being social.

The ones with their phones aren't avoiding human connection — they're inside it. Group threads. Comments on a friend's post. A photo their sister sent. The medium changed; the behavior didn't.

## We've been doing this for two hundred thousand years

Anthropologists have a name for the gossip humans do around a fire: social grooming. Apes pick lice off each other to maintain bonds. We invented language and skipped the lice. Talking about who did what, who likes whom, who should be trusted, who was unreliable — that's not a flaw of human nature. That's the operating system.

Tribes that gossiped well survived. They knew which neighbors were dangerous, which berries were poisonous, which rivers had fish this season. The information that kept you alive was social information.

Then we built villages. Then market squares. The blacksmith didn't put up a billboard. He showed up Tuesday and Thursday, talked to everyone who walked through, and the regulars told their cousins. *That* was the marketing engine for ten thousand years.

## The square scaled up

Social platforms aren't replacing the village square. They *are* the village square at planetary scale. The mechanics are identical:

- People show up to see what's happening
- They share what they made
- They recommend what they liked
- They warn each other about what was bad
- And businesses that show up consistently become known

What's different is the size. The blacksmith's village had maybe two hundred people. Your Instagram following could have two thousand. Your business's potential customer base on Facebook could have two million.

What hasn't changed is the requirement to *show up*. The blacksmith who locked his door for six months found his customers had moved on to the next town. Same physics today.

## What this means for your business

Your customers are not browsing your website at 3 a.m. when they think of you. They're scrolling. They're checking what their friend posted. They're looking at a vendor someone in their group recommended. They're consuming information socially because that's how humans have always consumed information.

If your business isn't in that stream — visible, consistent, recommendable — you're a blacksmith who locked his shop. Your customers aren't gone. They're just buying from someone whose door is open.

The next four pieces in this series cover how the platforms got built, which ones reach the most people, where your specific industry's customers congregate, and how to be present everywhere without burning out trying. But the foundation is this:

Humans are social. Business follows humans. Therefore business is social.

This was true in 1492. It's true in 2026. It will be true when whatever replaces TikTok arrives.

The only question is whether you're showing up.`,
  },

  // ─── 2. HOW SOCIAL NETWORKS WERE ACTUALLY BUILT ───────────────────────────
  {
    slug: "how-social-networks-were-actually-built-the-trojan-horse-of-free",
    title: "How Social Networks Were Actually Built: The Trojan Horse of \"Free\"",
    meta_title: "How Social Networks Were Built — and Why It Matters to You",
    excerpt: "Every social platform you've ever used was built on the same playbook: bring the people first, the businesses will follow. Understanding that playbook is how you actually use these tools.",
    content_type: "authority_overview",
    content_pillar: "growth",
    body: `In 2006, Yahoo offered Mark Zuckerberg one billion dollars for Facebook. He was twenty-two years old. The company had about nine million users and almost no revenue. Zuckerberg said no.

His investors were furious. His co-founders thought he was crazy. The press treated it as a punchline.

He wasn't crazy. He was looking at the same playbook every social network has used since.

## The playbook in one sentence

Bring the people. The businesses will follow.

That's it. That's the whole thing. Every social platform you've ever heard of operates on this premise. The product is *you*, and the customer is whoever wants to reach you.

Friendster was the first to scale the model in 2002 — and the first to discover its punishment when their servers couldn't handle the traffic. Users got frustrated, left for the next thing, and Friendster became a cautionary tale about how fragile attention is.

MySpace took the lesson and ran with it. Customizable pages, music integration, garish glitter graphics. They got 75 million users by 2007 and felt unstoppable.

Facebook took the *next* lesson: clean it up, make it work for older users, build a graph of real-world relationships. By 2009 MySpace was a museum.

Instagram skipped the friends-and-status update entirely and went straight to photos. Vine and then TikTok skipped photos and went straight to short video. Each one bringing the *next* wave of people that the previous platform was missing.

## Why this matters when you're trying to reach customers

When you understand that the entire purpose of a social platform is to harvest attention and rent it back to whoever pays, the way you should approach the platform changes.

These companies are not your friend. They're not built to help your small business. They're built to put your customers' attention in front of the highest bidder. Sometimes that's your competitor with a paid ad. Sometimes it's a brand from another industry entirely. Sometimes — when you're consistently visible, when your content is good enough that the algorithm decides it earns the slot — it's you, for free.

The free path exists because if it didn't, the platform would die. Pure pay-to-play platforms collapse because users stop showing up to a feed that's all advertising. So the platforms keep enough free reach in the system to keep the audience around. That free reach is what every business is competing for.

## The implication for you

If you treat the platform like a megaphone — drop in, post your sale, leave — the algorithm treats you like a low-value participant. You'll be shown to almost no one. Posting and getting twelve impressions is the platform telling you that you haven't earned more.

If you treat the platform like a place where humans gather — where you show up consistently, share what you actually do, respond when people interact — the algorithm starts treating you like a worthwhile resident. Reach grows. Engagement compounds. The platform starts working *for* you because you're holding up your end of the deal: keeping the audience entertained.

The trojan horse of "free" is real. The platforms aren't free; you pay with your attention and your content. But businesses that understand the trade get back something genuinely valuable: a constant, low-friction channel to the customers who used to be impossible to find.

Next: which platforms have how many people, and which ones reach yours.

---

*Footnote — As of early 2026, Bloomberg values Meta at $1.5 trillion. Yahoo's billion-dollar offer would now buy 0.067% of the company.*`,
  },

  // ─── 3. THE REACH HIERARCHY ───────────────────────────────────────────────
  {
    slug: "the-reach-hierarchy-how-many-people-actually-see-each-platform",
    title: "The Reach Hierarchy: How Many People Actually See Each Platform",
    meta_title: "How Many People Use Each Social Platform (Honest 2026 Numbers)",
    excerpt: "Five billion social media users sounds impressive. The honest math underneath that number is more useful — and tells you which platforms are actually worth your time.",
    content_type: "authority_overview",
    content_pillar: "growth",
    body: `There are about 5.2 billion social media users on earth. That's almost two thirds of every human alive.

That number is true. It's also useless. It tells you nothing about whether your customers are on Facebook, whether your competitors are crushing you on TikTok, or whether putting your time into LinkedIn is worth it.

The honest reach hierarchy looks like this.

## Monthly active users, ranked

These are roughly the numbers as of early 2026. They shift, but the order is stable.

| Platform | MAU | Built for |
|---|---|---|
| Facebook | ~3.0 billion | Everyone |
| YouTube | ~2.7 billion | Video, search-driven |
| WhatsApp | ~2.4 billion | Messaging |
| Instagram | ~2.4 billion | Visual, lifestyle |
| TikTok | ~1.7 billion | Short video, discovery |
| LinkedIn | ~1.0 billion | Professional |
| Pinterest | ~520 million | Visual planning |
| Reddit | ~500 million | Community + discussion |
| X (Twitter) | ~430 million | Real-time text |

Notice what's true and what's misleading.

**Facebook is still the biggest.** Despite a decade of "Facebook is dying" headlines, three billion humans log in every month. They are disproportionately older — but in business terms, "older" means "homeowners with budgets," "decision-makers in households," and "people who actually pay for services."

**YouTube and Instagram are essentially tied** at the top of the visual platforms. YouTube is search-driven; people go there with a question. Instagram is feed-driven; people go there to fill time. That's a different relationship to the audience even when the user counts match.

**TikTok punches above its user count.** It's smaller than Instagram but has higher engagement per user, faster discovery (a brand-new account can go viral in a day), and a much younger demographic.

**LinkedIn is the smallest of the giants but the most concentrated.** A million-person platform full of professionals beats a billion-person platform full of mixed audiences if your customer is, say, a procurement manager.

## Why the rank is misleading

Two platforms with the same number of users are not equivalent.

What actually matters is **engaged reach for your specific customer**. A photographer doesn't care that Facebook has 3 billion users if her ideal client is on Instagram and Pinterest. A general contractor doesn't care that TikTok has 1.7 billion users if his customer is a 55-year-old homeowner who has never opened the app.

The right question *isn't* "which platform has the most users?" It's:

1. **Where does my specific customer spend time?**
2. **What kind of content do they engage with there?**
3. **How many of those platforms can I realistically be present on?**

The next piece in this series gets specific about which industries map to which platforms. The piece after that gets to the part where being present on five platforms used to require five full-time skills, and what changed.

But first, take the user-count rankings and then forget the order. The honest hierarchy isn't "biggest first." It's "biggest *for your customer* first."`,
  },

  // ─── 4. WHERE YOUR CUSTOMERS ACTUALLY LIVE ────────────────────────────────
  {
    slug: "where-your-customers-actually-live-platform-fit-by-industry",
    title: "Where Your Customers Actually Live: Platform Fit by Industry",
    meta_title: "Best Social Platforms by Industry — Where Your Customers Are",
    excerpt: "The right platform for your business isn't the biggest one. It's the one your specific customer opens when they're thinking about what you sell.",
    content_type: "authority_overview",
    content_pillar: "growth",
    body: `A wedding photographer asked me last year if she should be on TikTok. She had built a strong Instagram presence, was active on Pinterest, and had a Google Business Profile that was bringing in inquiries. TikTok felt like the next thing she "should" be doing.

I asked her where her last six clients had found her. Three from Instagram referrals. Two from Google searches. One from a Pinterest board. Zero from TikTok.

She didn't need TikTok. She needed to keep doing what was working and stop feeling guilty about ignoring something that wasn't.

This is the question every business has to answer: **where do my actual customers live?** Not where they could be. Where they are right now, when they're thinking about what you sell.

## Local service businesses (contractors, plumbers, electricians, HVAC, landscaping, roofing, cleaners)

Your customer is searching with intent. Something broke, something needs fixing, something needs building. They open Google.

- **Google Business Profile** is non-negotiable. The Local Pack — those three businesses that show up under the map — captures most of the click-through. If you're not in it, you don't exist.
- **Facebook** matters for the recommendations layer. People ask their neighborhood Facebook group for contractors and your name needs to show up. A Facebook page with photos and current activity supports that.
- **Instagram** matters for the proof layer. Before-and-after, finished projects, testimonials. Customers vet you here after they find you elsewhere.

You can ignore TikTok, LinkedIn, and Pinterest. Your customers aren't shopping for service trades there.

## Visual businesses (photographers, event venues, retail, interior design, florists, restaurants)

Your customer is browsing for inspiration. They're filling time, building a wedding board, planning a renovation, looking for somewhere to eat tonight.

- **Instagram** is your home court. The platform was built for visual storytelling.
- **Pinterest** is genuinely undervalued. People come there with planning intent — they're saving things they want, not just things they like. Pinterest converts to action better than most platforms.
- **Google Business Profile** still matters because the planning eventually becomes searching ("Italian restaurant near me," "wedding venue Pittsburgh").
- **Facebook** for community proof — events, hours, reviews, local visibility.
- **TikTok** for younger customer segments, especially in food, retail, and event venues. The discovery mechanic is unmatched.

## B2B services (consultants, agencies, software, professional services, manufacturers)

Your customer is at work, on a desktop, decision-making.

- **LinkedIn** is the only platform that really matters at scale. Decision-makers are there professionally; their attention is in a buying context.
- **YouTube** matters for credibility content — long-form explanations, demos, talks. Buyers research vendors via long-form before reaching out.
- **Twitter/X** has a niche but real B2B audience for tech, marketing, finance.

You can usually ignore TikTok, Instagram, and Pinterest unless your B2B has a strong consumer crossover.

## Personal brand and lifestyle businesses (coaches, fitness, beauty, wellness, content creators)

Your customer follows individuals more than businesses.

- **Instagram** for the daily-life, behind-the-scenes connection.
- **TikTok** for discovery and reach. Algorithm-driven exposure to new audiences.
- **YouTube** for depth and authority.
- **Pinterest** if your category is visual (beauty, fashion, recipes).

## Some businesses can't pick one

Wedding venues need Instagram (visual proof), Pinterest (planning), Google (search intent), Facebook (reviews + community), and increasingly TikTok (younger couples). Cutting any of these costs them inquiries.

Retail similarly spans the whole stack. So do most restaurants, especially those with strong takeout/delivery business who need to show up in casual browse mode AND in "I'm hungry now" search mode.

For these businesses, the historical advice — "pick one or two platforms and do them well" — has always been a compromise driven by the cost of being everywhere. Not by what was actually best for the business.

That's what changes next.`,
  },

  // ─── 5. THE COMPOUNDED MATH ───────────────────────────────────────────────
  {
    slug: "you-used-to-pick-one-the-new-math-says-all-of-them",
    title: "You Used to Pick One. The New Math Says All of Them.",
    meta_title: "Why Multi-Platform Social Media Now Beats Picking One",
    excerpt: "For twenty years, the smart advice was \"pick one platform and do it well.\" That advice was right at the time. It's no longer right, and the math has flipped.",
    content_type: "authority_overview",
    content_pillar: "growth",
    body: `In 2018, a contractor I know decided to "do social media right." He picked Facebook. His customers were on Facebook. He posted three times a week, responded to every comment, ran the occasional ad. He was disciplined.

Three years later his organic Facebook reach had collapsed by 80%. The platform changed its algorithm to favor friends-and-family content over business pages. His audience was still there; the platform just stopped showing his posts to them.

He should have been on Instagram too, and Google Business Profile, and probably YouTube. His customers were on those platforms — at least some of them. But he had picked one and committed, because that was the advice everyone gave.

The advice wasn't wrong in 2018. The advice is wrong now. Not because the world quietly drifted into something different. Because we made it wrong.

## Why "pick one platform" used to be right

Three things made multi-platform impossible for small businesses:

**Time.** Each platform demands native fluency. Instagram captions don't work on LinkedIn. TikTok video doesn't translate to Pinterest. Just *cross-posting* the same thing everywhere gets you penalized by the algorithms and ignored by the audience.

**Skill.** Knowing what works on Instagram is different from knowing what works on TikTok. Most small business owners have time to develop intuition for one platform, maybe two.

**Fatigue.** Being active on six platforms means six places to check, six places to respond, six content pipelines, six audiences with different expectations. People burned out and quit altogether.

So the math used to be: one hour per day on one platform > one hour per day spread across six platforms. The compromise was real.

## What we changed

The compromise existed because each platform's content had to be hand-crafted by a human who understood that platform. We removed that requirement.

A single photo of a finished kitchen can become:
- A square Instagram post with a tight, conversational caption
- A vertical Reels video with motion and a hook
- A Facebook post with longer narrative
- A Pinterest pin optimized for "kitchen renovation ideas" search
- A Google Business Profile post tied to your service area
- A TikTok with appropriate sound and pacing
- A LinkedIn post if you're targeting commercial work

That used to require a marketing manager and 90 minutes of effort per asset. We made it one capture and zero minutes of adaptation work.

## The compounded math

Here's what changes when you can be present on all the relevant platforms instead of one:

**Each platform reaches a different slice of your customer base.** Facebook reaches the homeowners who already know you. Instagram reaches the ones who follow contractors visually. Pinterest catches the ones who are planning a future renovation. Google catches the ones who need help today. TikTok catches the next generation forming their first opinions about who they'd hire.

If you're on one of those, you're reaching one slice. If you're on all of them, the slices compound. Not "your audience is 6x bigger" — that's wrong, audiences overlap. But the *moments* you're showing up multiply. The customer who saw your finished bathroom on Instagram, then looked you up on Google when they were ready, is a customer your single-platform competitor never met.

**Each platform's algorithm rewards consistency.** When you post on five platforms but only one has activity, the four quiet ones treat you as inactive. When you post on five and all five are alive, all five reward you with reach. The aggregate effect is greater than the sum.

**Each platform de-risks the others.** Facebook's algorithm changes? You still have Instagram. TikTok gets banned? You still have Pinterest and Google. The contractor who picked Facebook in 2018 is rebuilding from zero. The contractor who's everywhere just lost one channel.

## How we ended the "pick one platform" era

We didn't wait for it to end. We ended it.

TracPost was built with one assertion baked into every line of code: there is no defensible reason a small business should be visible on one platform when their customers are spread across eight. Every excuse that used to apply — time, skill, fatigue, content adaptation cost — we removed.

You capture once: a photo, a video, a moment from a job. The platform takes that capture and produces native content for each platform you're connected to. Instagram gets an Instagram-shaped post. TikTok gets a TikTok-shaped video. Pinterest gets a pin optimized for planning search. Google Business Profile gets a service-area post. Facebook gets the longer-form treatment. Each platform gets what it actually wants.

You no longer choose where to invest your social energy. You invest in *capturing what your business is doing*, and the compounded presence happens automatically.

The "pick one platform" era was a compromise driven by friction. We removed the friction. The era is over. We slammed the door on the way out.

Show up everywhere. The compounded reach is the real reach. The businesses still picking one platform in 2026 aren't being strategic — they're five years late, and their competitors who figured this out are about to leave them in the rearview.`,
  },
];

// ─── Insert ──────────────────────────────────────────────────────────────────

(async () => {
  const [tracpost] = await sql`SELECT id FROM sites WHERE blog_slug = 'tracpost' LIMIT 1`;
  if (!tracpost) {
    console.error("TracPost site (blog_slug='tracpost') not found.");
    process.exit(1);
  }

  const SERIES = { slug: "why-social-matters", name: "Why Social Matters", total: articles.length };

  let inserted = 0, skipped = 0;
  for (let i = 0; i < articles.length; i++) {
    const a = articles[i];
    const seriesMeta = { series: { ...SERIES, index: i + 1 } };
    const exists = await sql`SELECT id FROM blog_posts WHERE site_id = ${tracpost.id} AND slug = ${a.slug} LIMIT 1`;
    if (exists.length > 0) {
      console.log(`SKIP (exists): ${a.slug}`);
      skipped++;
      continue;
    }
    await sql`
      INSERT INTO blog_posts (
        site_id, slug, title, meta_title, excerpt, content_type, content_pillar, body, status, metadata
      ) VALUES (
        ${tracpost.id}, ${a.slug}, ${a.title}, ${a.meta_title}, ${a.excerpt},
        ${a.content_type}, ${a.content_pillar}, ${a.body}, 'draft', ${JSON.stringify(seriesMeta)}::jsonb
      )
    `;
    console.log(`INSERTED: ${a.title}`);
    inserted++;
  }
  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped}.`);
})().catch((err) => { console.error(err); process.exit(1); });
