import { sql } from "@/lib/db";

export interface ContentGap {
  tag: string;
  tagLabel: string;
  mentionedIn: Array<{ title: string; slug: string }>;
  suggestion: string;
}

/**
 * Detect content gaps — tags that appear in published bundled articles
 * but have no dedicated single-topic deep dive.
 *
 * A "covered" tag has a published post where it's the primary focus:
 * - The tag appears in the post's tags AND
 * - The post has ≤ 3 tags total (focused, not bundled)
 *
 * Returns uncovered tags with the articles that mention them
 * and a suggested upload prompt.
 */
export async function detectContentGaps(
  siteId: string
): Promise<ContentGap[]> {
  // Fetch all published posts with their tags
  const posts = await sql`
    SELECT slug, title, tags, content_type
    FROM blog_posts
    WHERE business_id = ${siteId} AND status = 'published'
    ORDER BY published_at DESC
  `;

  if (posts.length === 0) return [];

  // Fetch pillar config for tag labels
  const [site] = await sql`
    SELECT pillar_config FROM businesses WHERE id = ${siteId}
  `;
  const pillarConfig = (site?.pillar_config || []) as Array<{
    id: string;
    label: string;
    tags: Array<{ id: string; label: string }>;
  }>;

  // Build tag ID → label map
  const tagLabelMap = new Map<string, string>();
  for (const pillar of pillarConfig) {
    for (const tag of pillar.tags) {
      tagLabelMap.set(tag.id, tag.label);
    }
  }

  // Categorize posts as "bundled" (4+ tags) or "focused" (≤3 tags)
  const focusedTags = new Set<string>();
  const bundledPosts: Array<{ slug: string; title: string; tags: string[] }> = [];

  for (const post of posts) {
    const tags = Array.isArray(post.tags) ? (post.tags as string[]) : [];
    if (tags.length <= 3) {
      // Focused post — these tags are "covered"
      for (const tag of tags) {
        focusedTags.add(tag);
      }
    }
    if (tags.length > 3) {
      bundledPosts.push({
        slug: post.slug as string,
        title: post.title as string,
        tags,
      });
    }
  }

  // Find tags in bundled posts that have no focused coverage
  const gapMap = new Map<string, { mentionedIn: Array<{ title: string; slug: string }> }>();

  for (const post of bundledPosts) {
    for (const tag of post.tags) {
      if (focusedTags.has(tag)) continue;

      if (!gapMap.has(tag)) {
        gapMap.set(tag, { mentionedIn: [] });
      }
      gapMap.get(tag)!.mentionedIn.push({ title: post.title, slug: post.slug });
    }
  }

  // Convert to ContentGap array
  const gaps: ContentGap[] = [];
  for (const [tag, data] of gapMap) {
    const label = tagLabelMap.get(tag) || tag.replace(/_/g, " ");
    gaps.push({
      tag,
      tagLabel: label,
      mentionedIn: data.mentionedIn,
      suggestion: `Upload a detail shot of your ${label.toLowerCase()} work`,
    });
  }

  // Sort by number of mentions descending — most-referenced gaps first
  gaps.sort((a, b) => b.mentionedIn.length - a.mentionedIn.length);

  return gaps;
}
