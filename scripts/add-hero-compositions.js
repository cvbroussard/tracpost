/**
 * Adds Gemini-ready hero composition prompts to each Why Social Matters article.
 * Stored in metadata.hero_composition as a single multi-line string formatted
 * as a paste-ready image generation prompt.
 *
 * Storage convention: assets.tracpost.com/marketing/blog/why-social/0N-shortname.jpg
 */
const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });
const sql = neon(process.env.DATABASE_URL);

const COMPOSITIONS = {
  "humans-are-not-lone-wolves-business-has-always-been-social": `A late-afternoon coffee shop scene. Three groups visible in one frame: two people leaning in conversation at a small round table, one person alone on a laptop visibly smiling at something on the screen, and a table of three sharing one phone — all leaning in to look at it. Warm golden-hour light streaming through large windows behind. The composition implies the same human behavior — connection — expressed through three different mediums.

— Aspect ratio: 16:9
— Camera: eye-level, ~35mm wide-environmental shot, shallow depth keeping all three groups discernible
— Style: documentary editorial photography, warm tonal grade, candid feel
— Save to: https://assets.tracpost.com/marketing/blog/why-social/01-lone-wolves.jpg`,

  "how-social-networks-were-actually-built-the-trojan-horse-of-free": `A wrapped gift box, deep red ribbon, stamped with the word "FREE" in tall block letters, mid-unwrap. Instead of a gift inside, an industrial mechanism is revealed — brass gears, lens-like sensors pointed outward like surveillance cameras, a side chute marked "advertisers" with a steady stream of gold coins flowing out into a separate container. The trap exposed mid-action.

— Aspect ratio: 16:9
— Camera: N/A (illustration)
— Style: vintage industrial blueprint illustration, sepia and ink tones with selective gold highlights, mid-century engineering manual aesthetic
— Save to: https://assets.tracpost.com/marketing/blog/why-social/02-trojan-horse.jpg`,

  "the-reach-hierarchy-how-many-people-actually-see-each-platform": `A stylized horizontal bar chart on a deep dark canvas. Each bar represents a social platform's monthly active users, but the bars themselves are not solid color — they are composed of thousands of tiny human silhouettes packed shoulder-to-shoulder like crowds. Facebook's bar is the longest and densest. LinkedIn's bar is shorter but populated with suit-clad professional silhouettes. TikTok's bar shorter still but composed of younger, more animated silhouettes (some with phones raised, some dancing). Platform names labeled in clean typography below each bar. No marketing flourishes — feels like a serious data visualization.

— Aspect ratio: 16:9
— Camera: N/A (illustration / data viz)
— Style: editorial infographic on dark navy background, white and warm-amber accents, deliberately under-designed — it should feel like authoritative data, not a brochure
— Save to: https://assets.tracpost.com/marketing/blog/why-social/03-reach-hierarchy.jpg`,

  "where-your-customers-actually-live-platform-fit-by-industry": `A stylized world atlas, but instead of countries each territory is labeled with a business type — "Wedding Photographers", "Plumbers", "Restaurants", "B2B Consultants", "Personal Brands", etc. — drawn as oddly-shaped regions. Each territory has a "capital city" pinned with a platform icon (Instagram pin in Photographer territory, Google pin in Plumber territory, LinkedIn pin in B2B Consultant territory, etc.). Trade routes / pathways drawn between territories show how businesses navigate multiple platforms. Cartography aesthetic — clean linework, parchment-cream background.

— Aspect ratio: 16:9
— Camera: N/A (illustration / map)
— Style: minimalist cartography, hand-drawn linework, parchment-cream background with charcoal ink, single accent color (warm red) for platform pins
— Save to: https://assets.tracpost.com/marketing/blog/why-social/04-platform-fit.jpg`,

  "you-used-to-pick-one-the-new-math-says-all-of-them": `A heavy industrial door — riveted steel, weathered, painted text reading "THE PICK ONE PLATFORM ERA" in old-stencil letters across its face — caught at the exact moment of slamming shut. Dust particles suspended in a beam of golden backlight cutting through the gap. The door is in motion (slight motion blur on the leading edge), still closing. The composition implies someone has just walked through and pulled it shut behind them with finality. The viewer is on the outside, looking at the closed era.

— Aspect ratio: 21:9 (cinematic)
— Camera: side view, low angle (around 4 feet up), wide lens, motion captured in a single decisive frame
— Style: cinematic photography, high-contrast moody lighting, golden-amber backlight against deep blue-black foreground
— Save to: https://assets.tracpost.com/marketing/blog/why-social/05-door-slam.jpg`,
};

(async () => {
  const [tp] = await sql`SELECT id FROM sites WHERE blog_slug = 'tracpost' LIMIT 1`;
  let count = 0;
  for (const [slug, composition] of Object.entries(COMPOSITIONS)) {
    const result = await sql`
      UPDATE blog_posts
      SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ hero_composition: composition })}::jsonb,
          updated_at = NOW()
      WHERE site_id = ${tp.id} AND slug = ${slug}
      RETURNING title
    `;
    if (result.length > 0) {
      console.log(`UPDATED: ${result[0].title}`);
      count++;
    } else {
      console.log(`NOT FOUND: ${slug}`);
    }
  }
  console.log(`\nDone. ${count}/${Object.keys(COMPOSITIONS).length} updated.`);
})().catch(err => { console.error(err); process.exit(1); });
