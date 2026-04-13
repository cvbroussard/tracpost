import { sql } from "@/lib/db";
import { blogArticleUrl, brandUrl } from "@/lib/urls";

interface LinkablePost {
  slug: string;
  title: string;
  tags: string[];
}

/**
 * Fetch all other published posts for a site (excluding the current one).
 */
async function getRelatedPosts(
  siteId: string,
  excludeSlug: string
): Promise<LinkablePost[]> {
  const rows = await sql`
    SELECT slug, title, tags
    FROM blog_posts
    WHERE site_id = ${siteId}
      AND status = 'published'
      AND slug != ${excludeSlug}
    ORDER BY published_at DESC
  `;
  return rows.map((r) => ({
    slug: r.slug as string,
    title: r.title as string,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
  }));
}

interface LinkableBrand {
  slug: string;
  name: string;
}

/**
 * Fetch all brands for a site (for auto-linking in articles).
 */
async function getSiteBrands(siteId: string): Promise<LinkableBrand[]> {
  const rows = await sql`
    SELECT slug, name FROM brands
    WHERE site_id = ${siteId}
      AND (SELECT COUNT(*) FROM asset_brands ab WHERE ab.brand_id = brands.id) >= 2
  `;
  return rows.map((r) => ({
    slug: r.slug as string,
    name: r.name as string,
  }));
}

/**
 * Build a map of matchable phrases → link targets.
 * Longer phrases take priority to avoid partial matches.
 * Includes both blog post titles/tags and brand names.
 */
function buildPhraseMap(
  posts: LinkablePost[],
  brands: LinkableBrand[],
  siteSlug: string,
  customDomain?: string | null
): Array<{ phrase: string; href: string; title: string }> {
  const entries: Array<{ phrase: string; href: string; title: string }> = [];

  for (const post of posts) {
    const href = blogArticleUrl(siteSlug, post.slug, customDomain);
    entries.push({ phrase: post.title, href, title: post.title });
    for (const tag of post.tags) {
      if (tag.length >= 4) {
        entries.push({ phrase: tag, href, title: post.title });
      }
    }
  }

  // Brand names → brand detail pages
  for (const brand of brands) {
    if (brand.name.length >= 3) {
      const href = brandUrl(siteSlug, brand.slug, customDomain);
      entries.push({ phrase: brand.name, href, title: brand.name });
    }
  }

  // Sort by phrase length descending — match longest phrases first
  entries.sort((a, b) => b.phrase.length - a.phrase.length);

  return entries;
}

/**
 * Auto-link entity mentions in HTML to related blog posts.
 *
 * Scans the rendered HTML for phrases matching other posts' titles and tags.
 * Links only the first occurrence of each match. Skips content already
 * inside <a>, <h1>, <h2>, <h3> tags to avoid nested links or header disruption.
 */
export async function autoLinkEntities(
  html: string,
  siteId: string,
  siteSlug: string,
  currentSlug: string,
  customDomain?: string | null
): Promise<string> {
  const [posts, brands] = await Promise.all([
    getRelatedPosts(siteId, currentSlug),
    getSiteBrands(siteId),
  ]);
  if (posts.length === 0 && brands.length === 0) return html;

  const phraseMap = buildPhraseMap(posts, brands, siteSlug, customDomain);
  const linked = new Set<string>(); // track which hrefs we've already linked
  let result = html;

  for (const { phrase, href, title } of phraseMap) {
    if (linked.has(href)) continue;

    // Case-insensitive match for the phrase, but only in paragraph/list text
    // Avoid matching inside existing tags or headings
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?<![<\\/a-zA-Z])\\b(${escaped})\\b(?![^<]*<\\/a>)(?![^<]*<\\/h[1-3]>)`,
      "i"
    );

    const match = result.match(pattern);
    if (match && match.index !== undefined) {
      // Verify we're not inside an <a> or heading tag
      const before = result.slice(0, match.index);
      const lastOpenA = before.lastIndexOf("<a ");
      const lastCloseA = before.lastIndexOf("</a>");
      const lastOpenH = Math.max(
        before.lastIndexOf("<h1"),
        before.lastIndexOf("<h2"),
        before.lastIndexOf("<h3")
      );
      const lastCloseH = Math.max(
        before.lastIndexOf("</h1>"),
        before.lastIndexOf("</h2>"),
        before.lastIndexOf("</h3>")
      );

      const insideLink = lastOpenA > lastCloseA;
      const insideHeading = lastOpenH > lastCloseH;

      if (!insideLink && !insideHeading) {
        const matchedText = match[1];
        const link = `<a href="${href}" title="${title.replace(/"/g, "&quot;")}">${matchedText}</a>`;
        result =
          result.slice(0, match.index) +
          link +
          result.slice(match.index + matchedText.length);
        linked.add(href);
      }
    }
  }

  return result;
}
