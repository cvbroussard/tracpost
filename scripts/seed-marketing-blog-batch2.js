#!/usr/bin/env node
/**
 * Seed three SEO-targeted marketing blog articles (batch 2) for TracPost's own blog.
 * Industries: Restaurant, Pet Grooming, Med Spa / Aesthetics.
 *
 * Usage:
 *   node scripts/seed-marketing-blog-batch2.js
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

// ─── Article 4: Restaurant ─────────────────────────────────────────────────

const article4 = {
  slug: "how-to-get-more-restaurant-customers-without-paying-for-ads",
  title: "How to Get More Restaurant Customers Without Paying for Ads",
  meta_title: "How to Get More Restaurant Customers Without Ads",
  excerpt: "Your competitor down the street is always packed. They're not running ads — they're just showing up where hungry people are already looking. Here's how they do it.",
  content_type: "authority_overview",
  content_pillar: "growth",
  tags: ["restaurant marketing", "google business profile", "restaurant social media", "local seo", "restaurant growth"],
  body: `Your competitor's dining room is full on a Tuesday night. Yours has open tables. You know your food is as good or better. Your prices are fair. Your service is solid. But they're packed, and you're wondering if you should try Yelp ads again.

You shouldn't. The last time you spent $400/month on Yelp, you got clicks from people who were never going to drive 20 minutes for dinner. The restaurant that's beating you isn't buying ads. They're doing something simpler and more effective — they're visible in the places where hungry people are already making decisions.

Here's what that actually looks like.

## Your Google Business Profile Is Life or Death

When someone searches "restaurants near me" or "best Thai food in [your city]," Google shows a map with three restaurants before any website or Yelp listing appears. That's the Local Pack, and for restaurants, it's the most valuable real estate on the internet.

The restaurant that shows up in those three spots gets the call, the reservation, the walk-in. The restaurant that doesn't might as well not exist for that search.

Your Google Business Profile (GBP) is what powers that listing. And most restaurant owners either set theirs up in 2019 and forgot about it, or never claimed it at all. Meanwhile, your competitor updates theirs every week.

Here's what a well-maintained restaurant GBP listing looks like: accurate hours (including holiday hours updated before every holiday), a full menu linked or described in the services section, at least 50 photos of actual dishes from your kitchen, weekly posts showing specials and new items, and responses to every single review — good and bad.

Google rewards activity. A listing that was last updated six months ago gets pushed down. A listing that posted a photo of today's lunch special gets pushed up. It's that straightforward.

## Daily Specials Are Free Content

Most restaurant owners think of daily specials as a menu decision. They're also a content decision — the easiest one you'll ever make.

Every daily special is a photo opportunity. Snap the plated dish, post it to your Google Business Profile and Instagram Story before the lunch rush. You've just told Google your business is active today, shown potential customers exactly what they could be eating in an hour, and given your regulars a reason to come in tonight instead of tomorrow.

The restaurants that do this consistently — not perfectly, just consistently — build a rhythm that algorithms reward. Three specials a week is three posts a week. That's 156 pieces of content a year, generated from something you're already doing.

You don't need a photographer. You don't need a ring light. A clean plate on a clean surface, shot on your phone with natural light, outperforms stock photography every time. People don't want to see your food looking like a magazine ad. They want to see what's actually going to show up at their table.

## Review Velocity Beats Review Rating

You have a 4.6 on Google with 89 reviews. Your competitor has a 4.4 with 215 reviews and got 8 new ones this month. Google shows them first.

This surprises restaurant owners, but Google's algorithm cares more about how frequently you're getting reviewed than your average score. Review velocity — the rate at which new reviews arrive — signals that your restaurant is active, popular, and relevant right now.

A 4.8 rating with reviews that stopped coming in six months ago tells Google your restaurant might be coasting or declining. A 4.4 with steady weekly reviews tells Google people are eating there right now and have opinions about it.

How to increase velocity: ask every satisfied table. Train your servers to mention it. Put a QR code on the check presenter — not a table tent they'll ignore, but physically on the thing they're already holding. "If you enjoyed dinner tonight, a Google review helps us a lot" — that's it. No script, no awkwardness. The customers who love you will do it. You just have to ask.

And respond to every review. Every one. The five-star review gets a "Thank you, glad you enjoyed the short rib" — something specific that shows a human read it. The two-star review gets an honest, non-defensive response. Google tracks your response rate and factors it into ranking.

## Instagram Is the New Menu

Before someone makes a reservation, they check your Instagram. This is especially true for the 25-45 demographic — the segment that eats out most frequently and spends the most per visit.

They're not reading your website. They're scrolling your feed to answer three questions: Does the food look good? Is the vibe right? Is this place still relevant?

A feed with beautiful food shots from last month answers all three positively. A feed whose last post is from October answers none of them.

Your Instagram feed is a living menu. When someone lands on it, they should see what you're serving this week, not what your dining room looked like when you opened. Every seasonal menu change, every new dish, every beautifully plated entree — that's a post. The restaurants that stay booked treat their Instagram like a daily window display, not a scrapbook.

And the format matters. Instagram Stories disappear after 24 hours, which makes them perfect for daily specials, behind-the-scenes prep, and in-the-moment content. A 15-second video of your chef torching a crème brûlée gets more engagement than a posed photo of your dining room. Feed posts should be your best dishes, your best plating, your strongest visual moments. Stories are for the everyday rhythm.

## Your Regulars Will Market for You — If You Let Them

Here's something most restaurant owners undervalue: when a regular takes a photo of their meal and posts it to their personal Instagram, that's worth more than any ad you could run. Their followers trust them. Their recommendation carries weight. And it costs you nothing.

But most people won't post about your restaurant unprompted. They need a small nudge. The most effective nudge is making the food photogenic and the restaurant Instagrammable — not in a gimmicky way, but in a way that makes someone reach for their phone.

A well-plated dish on a distinctive plate, good lighting at the table, a signature cocktail with a garnish that catches the eye — these aren't just hospitality decisions, they're marketing decisions. Every customer photo that gets posted is a free endorsement to their entire network.

Some restaurants go further: a branded hashtag on the menu, a "share your meal" callout on the table, or simply reposting customer photos on their own account (with credit). When people see that you reshare customer content, they're more likely to tag you next time. It's a flywheel.

## Your 2019 Menu Photos Are Hurting You

Go look at the photos on your Google listing right now. If the top images are from your grand opening, or worse, from a previous owner, they're actively working against you.

People make dining decisions based on food photos. Blurry, dark, or outdated photos tell potential customers that you either don't care about presentation or aren't paying attention to your online presence. Both conclusions lose you the reservation.

Replace them. Not all at once — Google prefers a steady stream of new uploads over a bulk dump. Upload three to five new food photos per week. Shoot them during service, not in a staged session. Real plates, real lighting, real portions. Within two months, your outdated photos will be pushed below the new ones.

## Consistency Beats Polish

The restaurant next door isn't hiring a social media agency. They're not using Canva templates or scheduling tools. Their owner or GM is taking a phone photo of the daily special and posting it to Instagram and Google before the lunch rush. Every day. That's it.

It's not beautiful. It's not strategic. It's just consistent. And consistency — posting three to five times a week, every week, month after month — is what separates the restaurants that are always full from the ones that are always wondering why they're not.

## Turning Kitchen Output Into Marketing Output

Every day your kitchen produces dozens of plates worth photographing. Specials get prepped, new dishes get tested, seasonal ingredients arrive, desserts get plated. All of it is content waiting to happen.

The problem has never been material — it's been the gap between the kitchen and the publish button. By the time service is over, nobody's thinking about Instagram.

[TracPost](https://tracpost.com) closes that gap. A photo of tonight's special, taken on a phone during prep, becomes an Instagram Story, a Google Business Profile post, a Facebook update, and a blog entry — automatically. The daily output of your kitchen becomes the daily fuel for your marketing. No captions to write, no platforms to log into, no social media expertise required.

Your kitchen already produces the content. The only question is whether it makes it off your phone.

---

*Your competitor isn't a better restaurant. They're just a more visible one. Show up where hungry people are looking — Google, Instagram, your review pages — and do it consistently. Or [let TracPost turn your kitchen's daily output into the marketing that keeps your dining room full](https://tracpost.com).*`
};

// ─── Article 5: Pet Grooming ───────────────────────────────────────────────

const article5 = {
  slug: "how-to-get-more-grooming-clients-without-spending-on-ads",
  title: "How to Get More Grooming Clients Without Spending on Ads",
  meta_title: "How to Get More Grooming Clients Without Ads",
  excerpt: "You take before-and-after photos of every groom. Your camera roll has thousands of them. That's the most powerful marketing content in any service industry — and you're not using it.",
  content_type: "authority_overview",
  content_pillar: "growth",
  tags: ["pet grooming marketing", "grooming business growth", "google business profile", "pet grooming social media", "grooming clients"],
  body: `You finished a doodle groom yesterday — a matted rescue that came in looking like a dust mop and left looking like a show dog. You took the before photo because you always do. You took the after photo because the transformation was too good not to. Both photos went into your camera roll, where they joined 4,000 other groom photos you've taken over the past two years.

You posted the last one to Instagram three weeks ago. It got 87 likes — more than most small businesses see in a month. A few people commented asking for your number. One of them booked.

Your camera roll is full of content that outperforms anything a marketing agency could produce for you. Before-and-after groom photos are the highest-engagement content in any service industry. The problem isn't the content. The problem is getting it from your phone to the places where new clients are looking for you.

## Before-and-After Photos Are Marketing Gold

No other service industry has the visual advantage that grooming does. A matted, overgrown dog walks in your door looking uncomfortable. Two hours later, a different dog walks out — clean, shaped, fluffy, and clearly happy. That transformation is inherently shareable.

Before-and-after content performs well in every industry, but pet grooming has two unfair advantages. First, dogs are universally appealing. People who don't own pets will still stop scrolling to look at a dramatic groom transformation. Second, the transformation is unambiguous. A kitchen remodel is subjective — maybe you like the old cabinets better. A matted-to-magnificent groom transformation is objectively better, and everyone can see it instantly.

This content performs on every platform. Instagram, Facebook, TikTok, Google Business Profile — it doesn't matter. A clean before-and-after of a dramatic groom stops the scroll. And unlike other businesses that have to manufacture content, you're producing this raw material every single day. Every groom is a potential post.

## Google Business Profile Drives Walk-Ins

When a pet parent searches "dog grooming near me" or "best groomer in [your city]," Google shows a map with three businesses before any website appears. Your Google Business Profile listing is what gets you into those three spots.

For grooming shops, GBP photos are especially powerful. A potential client scanning the Local Pack results isn't reading business descriptions — they're looking at photos of groomed dogs. A listing with 30 recent, high-quality groom photos tells them everything they need to know: you're skilled, you're active, and dogs look great when they leave your shop.

Upload your best groom photos to your GBP listing every week. Not in batches — Google rewards recency. Three photos this week matter more than 30 photos six months ago. And post updates to your listing: a photo of a fresh groom with a one-line caption ("Full groom and hand-strip on this handsome Wire Fox Terrier today") shows Google your business is alive and gives potential clients a reason to call.

Most grooming shops never post to their Google listing. If you post weekly, you're already outpacing every competitor in your area.

## Breed-Specific Content Ranks in Search

Here's something most groomers don't realize: when a pet parent searches "best goldendoodle groomer near me" or "poodle grooming [your city]," Google is looking for content that matches those specific terms.

Your website probably says "we groom all breeds." That's fine, but it doesn't help you rank for breed-specific searches — and breed-specific searches are the highest-intent queries in grooming. Someone searching for a goldendoodle groomer isn't browsing. They have a goldendoodle. They need a groomer. They're ready to book.

A blog post titled "Goldendoodle Grooming in [Your City]: What to Expect" will rank for that exact search. It doesn't need to be 2,000 words. Cover the coat type, the grooming schedule, common styles (puppy cut, teddy bear cut, kennel cut), your approach, and pricing guidance. Include two or three before-and-after photos of doodles you've actually groomed.

Do this for your top five breeds — the ones that fill your book — and you've created five pages that capture high-intent, breed-specific traffic in your city. Your competitor whose website just says "all breeds welcome" can't compete with that.

## The Pickup Photo Is Your Best Marketing Moment

Every groomer knows this moment: the owner walks in to pick up their dog, and the dog is beautiful. The owner's face lights up. They pull out their phone. If the dog is a puppy or a dramatic transformation, the owner is already composing an Instagram post in their head.

This is the single most powerful marketing moment in your business, and most shops let it pass without capturing it.

The pickup photo — a freshly groomed dog, bandana on, looking directly at the camera — is the photo that gets shared. Not the clinical before-and-after you take for your own records. The beauty shot. The "look at my baby" shot. The one that makes the owner say "oh my god, can you send me that?"

When you send that photo to the client, two things happen. First, they share it. They text it to their spouse, post it to their Instagram Story, put it on Facebook. Their friends see it. "Where do you take your dog?" is one of the most common questions pet parents ask each other. Your photo just answered it.

Second, you now have a piece of content that the client has already validated. If they loved it enough to share, it's good enough to post on your business accounts. Tag them (with permission), and you've just created a piece of content that reaches their entire network and yours.

## Reviews From Pet Parents Are Emotional — Use That

Pet owners don't leave reviews like "good service, fair price." They write paragraphs. They upload photos. They name their dog. "Biscuit was so scared of groomers after a bad experience, and Sarah was SO patient with him. He actually wagged his tail when I picked him up. We're never going anywhere else."

These reviews are marketing gold because they contain exactly the emotional proof that convinces other pet parents to trust you with their dog. And Google indexes the content of reviews as ranking signals — when someone mentions "scared dog" or "puppy's first groom" or "goldendoodle" in a review, those terms help you rank for related searches.

Encourage reviews actively. After every groom, send the pickup photo to the client with a simple line: "So glad Biscuit did great today! If you have a minute, a Google review would mean a lot to us." The photo is the trigger — they're already feeling the warm glow of seeing their dog look amazing. That's the moment to ask.

Respond to every review, and make it specific. Not "Thanks for the review!" but "Biscuit was such a good boy — his coat is really filling in nicely since we switched to the 6-week schedule." This shows future clients that you know their dogs by name. For a pet parent choosing between two groomers, that's the deciding factor.

## The Calendar Writes Itself

Grooming has a built-in content calendar that most shops ignore:

**Spring:** De-shedding season. Show the mountain of undercoat you brushed out of a Husky. Those photos are viscerally satisfying — people can't look away from a pile of fur that weighs more than a Chihuahua.

**Summer:** Summer cuts. Short clips, puppy cuts, the "I can finally see my dog's eyes" transformation. Tie it to weather — "It's going to be 95 this weekend. Your double-coated dog is thinking about that summer cut."

**Fall:** Back-to-routine grooms. Post-summer coat recovery. Senior dog spa days.

**Winter holidays:** Bandana season. Holiday bows. "Santa photos" with freshly groomed dogs. This is the highest-shareability content of the year — every pet parent wants a holiday photo of their groomed dog.

**Puppy first grooms:** Year-round. A puppy's first professional groom is a milestone moment. Document it. These posts get shared by the puppy's entire extended family.

**Breed-specific days:** National Poodle Day, Doodle appreciation posts, Rescue Dog Day. These hashtags trend, and breed communities are fiercely engaged.

You don't need to invent content ideas. The grooming calendar generates them automatically.

## Your Camera Roll Is a Client Acquisition Machine

You already take the photos. Every groom, every day, the content is being created as a byproduct of doing your job. The gap is between the camera roll and the platforms where new clients are searching for you.

[TracPost](https://tracpost.com) closes that gap. A before-and-after photo pair becomes a Google Business Profile post, an Instagram carousel, a Facebook update, and a breed-specific blog article — automatically. Every groom you photograph becomes content across eight platforms, without you writing a caption or logging into anything.

You're already creating the hardest part — the visual proof that you're great at what you do. The rest is just distribution.

---

*Your camera roll has thousands of transformations that could be filling your appointment book. Stop letting them sit there. Post consistently, build your Google presence, and let your best work speak for itself — or [let TracPost turn every groom into content that brings in new clients](https://tracpost.com).*`
};

// ─── Article 6: Med Spa / Aesthetics ───────────────────────────────────────

const article6 = {
  slug: "how-to-get-more-med-spa-clients-without-relying-on-ads",
  title: "How to Get More Med Spa Clients Without Relying on Ads",
  meta_title: "How to Get More Med Spa Clients Without Ads",
  excerpt: "Your competitor's Instagram is flawless, their calendar is full, and they're not spending $5K/month on Facebook ads. Here's what they're actually doing instead.",
  content_type: "authority_overview",
  content_pillar: "growth",
  tags: ["med spa marketing", "aesthetics marketing", "med spa growth", "google business profile", "med spa social media"],
  body: `Your competitor has a six-week waitlist for Botox appointments. Their Instagram looks like a medical journal crossed with a lifestyle magazine. Every time you open Facebook, their before-and-after results show up in your feed — and not because they're paying for it.

You've tried Facebook ads. You spent $3,000 last month and got 40 leads, half of which were price shoppers who ghosted after the consultation. You know your results are as good as theirs. Your injector has more experience. Your facility is nicer. But they're booked and you have open slots on Thursdays.

The difference isn't their ad budget. It's their content.

## Before-and-After Results Are the Highest-Trust Content You Can Produce

Nothing converts a med spa prospect into a booked consultation faster than seeing real results on a real person. Not a testimonial. Not a price list. Not a celebrity endorsement. A genuine before-and-after of a treatment you performed, on someone who looks like them, with results they want for themselves.

This is the content your competitor is using, and it works because it eliminates the biggest barrier in aesthetics: trust. A prospect considering lip filler has two fears — it won't look good, and it won't look natural. A before-and-after that shows subtle, beautiful, natural-looking results neutralizes both fears instantly. No ad copy can do that. No brochure can do that. Only visual proof.

The key is consent documentation. Every patient who agrees to let you use their results photos (with proper HIPAA-compliant consent) is giving you the most valuable marketing asset in medicine. Build the consent form into your intake process. Make it opt-in, not opt-out. Explain exactly where photos will be used — Instagram, your website, Google listing. Most patients are happy to share. Some are thrilled — they want to show off their results too.

One critical rule: never show identifying features without explicit permission. Lip filler close-ups, skin treatment zones, body contouring areas — these can be compelling without ever showing a patient's full face. When a patient does consent to full-face photos, that content performs at a completely different level.

## Educational Content Positions You as the Expert

Price shoppers compare costs. Educated patients compare expertise. The med spa that teaches prospects about treatments before they book the consultation wins the patients who are willing to pay for quality.

When someone searches "how long does Botox last" or "what's the difference between Juvederm and Restylane," they're in research mode. If your practice has a blog post that answers that question thoroughly — with real clinical knowledge, not marketing fluff — you've just established yourself as the expert before they've ever walked through your door.

This shifts the dynamic in the consultation. Instead of a prospect comparing your price to three other med spas, you have an informed patient who already trusts your expertise because they've been reading your content for weeks. Your consult-to-close rate improves dramatically when patients arrive pre-educated through your content.

Write about what you know. Your injector has opinions about injection technique that differ from the practitioner down the street — that's content. Your nurse has a skin prep protocol that gets better results — that's content. Your opinion on trending treatments (why you offer certain procedures and why you don't) — that's authority.

Topics that rank well in search: treatment comparisons (Botox vs. Dysport), recovery timelines by treatment, candidacy guides (who's a good candidate for a certain procedure), cost breakdowns with context about why pricing varies, and treatment combination guides (what works well together).

## Google Business Profile Owns "Near Me" Searches

When someone searches "Botox near me" or "laser hair removal [your city]," Google shows a map with three med spas before any website appears. Your Google Business Profile determines whether you're one of those three.

For med spas, GBP is especially high-value because the searches are treatment-specific and high-intent. Someone searching "CoolSculpting near me" isn't browsing — they've already decided they want the treatment. They're choosing where to get it. If your listing has recent photos, strong reviews, and an active posting history, you win that decision.

The med spas that dominate local search do three things consistently:

**They post treatment results weekly.** A before-and-after of a lip augmentation, posted to GBP with a brief caption about the treatment and product used, tells Google your practice is active and tells the searcher you do excellent work.

**They respond to every review.** Reviews mentioning specific treatments — "amazing Botox results" or "best microneedling I've ever had" — become ranking signals for those treatment-specific searches. Responding shows both Google and future patients that you're engaged.

**They keep their services list exhaustive.** Every treatment you offer should be listed individually in your GBP services section with a description. "Dermal Fillers" is one entry. "Lip Augmentation with Juvederm" is another. "Under-Eye Filler with Restylane" is another. Each service listing creates a new signal to Google about what searches your practice should appear for.

## The Consult-to-Close Rate Secret

Here's a metric most med spas don't track against their content efforts: consult-to-close rate.

When a prospect books a consultation after finding you through a Google ad, they're cold. They've seen your ad, maybe clicked through to your website, and booked because the offer was compelling. They're still shopping. Your consult-to-close rate on ad-driven leads is probably 40-50%.

When a prospect books after following your Instagram for three months, reading your blog posts about the treatment they want, and seeing dozens of your before-and-after results, they're warm. They've already decided you're the right provider. The consultation is a formality. Your consult-to-close rate on content-driven leads is typically 70-85%.

The math changes everything. Twenty consultations from ads at a 40% close rate gives you 8 patients. Twenty consultations from organic content at a 75% close rate gives you 15 patients. Same number of consultations, almost double the revenue.

This is why your competitor can spend less on ads and book more treatments. Their content is doing the selling before the prospect ever walks in.

## Provider Spotlight Content Builds Personal Trust

Aesthetics is a trust-intensive industry. Patients aren't just choosing a med spa — they're choosing a person to inject their face. Provider-specific content accelerates that trust in ways that brand-level content can't.

Introduce your providers. Not with a corporate headshot and a bio page that lists credentials — with real content. A day-in-the-life Instagram Story. A video of your injector explaining their approach to lip filler (what they look for, what they avoid, why they prefer certain products). A blog post about your nurse's training background and the continuing education they've completed this year.

When a prospect sees your injector explain their philosophy — "I always start conservative and build over multiple sessions; I'd rather have you come back for a touch-up than leave looking overdone" — that prospect is half-sold before they book. They feel like they already know the person who's going to treat them.

Provider content also differentiates you from the Groupon-driven clinics. When your competitor's feed is all discount offers and your feed showcases skilled providers with thoughtful approaches to treatment, you attract different patients — higher-value ones who care about results, not price.

## Seasonal Treatment Content Is Already Written for You

Aesthetics has a built-in content calendar tied to seasons, events, and patient behavior:

**January-February:** New year skin reset. Chemical peels, laser resurfacing, treatments with downtime that patients schedule in the winter.

**March-April:** Spring prep. Start Botox and filler appointments for wedding season. Laser hair removal for summer. "Start now so you're ready by June."

**May-June:** Summer skin protection. Pre-vacation treatments, SPF education, hydration-focused facials. Body contouring for summer confidence.

**July-August:** Maintenance content. Touch-up schedules, mid-summer glow treatments, post-sun skin recovery.

**September-October:** Fall rejuvenation. Post-summer skin repair, deeper treatments (laser, microneedling) that benefit from reduced sun exposure.

**November-December:** Holiday glow. Pre-event treatments, gift card promotions (aesthetics gift cards are a massive revenue driver), "party prep" packages.

Each season gives you a reason to post about specific treatments tied to what patients are already thinking about. You're not creating demand — you're meeting it with content at the exact moment they're considering booking.

## Video Outperforms Photos — and It's Easier Than You Think

Short-form video content — 15 to 60 seconds — outperforms photo content on every social platform for med spas. A quick clip of a lip filler injection (with consent), a time-lapse of a facial treatment, a provider answering one question about Botox — these formats get more reach, more engagement, and more saves than any static image.

You don't need production quality. An iPhone on a tripod, good lighting (which you already have in your treatment rooms), and a provider who can speak naturally about their work for 30 seconds. That's the entire setup.

The formats that work: treatment explainers ("here's what actually happens during microneedling"), myth-busters ("no, Botox doesn't freeze your face"), results reveals (before shot, treatment clip, after shot set to music), and day-in-the-life provider content.

## Turning Treatment Results Into a Content Engine

Every treatment you perform is a potential piece of content: a before-and-after photo, an educational blog post, a Google Business Profile update, a social media post. You're generating the raw material every day in your treatment rooms. The bottleneck is getting it published.

[TracPost](https://tracpost.com) removes that bottleneck. A consented before-and-after photo pair, taken on a provider's phone, becomes an educational blog post about the treatment, an Instagram post, a Facebook update, a Google Business Profile post, and a website portfolio entry — automatically. One photo, eight platforms, zero captions to write.

Your treatment results are your most persuasive marketing asset. The only question is whether they stay in a patient file or start filling your appointment book.

---

*Your competitor's secret isn't a bigger ad budget. It's a consistent stream of results-based content that builds trust before prospects ever walk in your door. Show your work, educate your audience, and let the results speak. Or [let TracPost turn every consented treatment result into content across every platform](https://tracpost.com).*`
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

  const articles = [article4, article5, article6];

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
