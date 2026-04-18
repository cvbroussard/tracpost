import { sql } from "@/lib/db";

export interface ContentCorrection {
  id: string;
  category: string;
  rule: string;
  scope: string;
  example_before: string | null;
  example_after: string | null;
}

export type CorrectionCategory =
  | "terminology"
  | "tone"
  | "content"
  | "visual"
  | "factual"
  | "platform";

export const CATEGORY_LABELS: Record<CorrectionCategory, string> = {
  terminology: "Terminology",
  tone: "Tone & Voice",
  content: "Content Direction",
  visual: "Visual Style",
  factual: "Factual Accuracy",
  platform: "Platform-Specific",
};

export const SCOPE_OPTIONS = [
  { value: "all", label: "All content" },
  { value: "blog", label: "Blog articles" },
  { value: "social", label: "Social captions" },
  { value: "video", label: "Video prompts" },
  { value: "instagram", label: "Instagram only" },
  { value: "linkedin", label: "LinkedIn only" },
  { value: "pinterest", label: "Pinterest only" },
  { value: "gbp", label: "Google Business only" },
  { value: "tiktok", label: "TikTok only" },
  { value: "youtube", label: "YouTube only" },
  { value: "facebook", label: "Facebook only" },
  { value: "twitter", label: "Twitter/X only" },
];

/**
 * Load active corrections for a site, optionally filtered by scope.
 * Scope matching: "all" corrections always included, plus scope-specific ones.
 */
export async function loadCorrections(
  siteId: string,
  scope?: string,
): Promise<ContentCorrection[]> {
  if (scope) {
    const rows = await sql`
      SELECT id, category, rule, scope, example_before, example_after
      FROM content_corrections
      WHERE site_id = ${siteId}
        AND is_active = true
        AND (scope = 'all' OR scope = ${scope})
      ORDER BY created_at ASC
    `;
    return rows as unknown as ContentCorrection[];
  }

  const rows = await sql`
    SELECT id, category, rule, scope, example_before, example_after
    FROM content_corrections
    WHERE site_id = ${siteId} AND is_active = true
    ORDER BY created_at ASC
  `;
  return rows as unknown as ContentCorrection[];
}

/**
 * Format corrections into a prompt injection block.
 * Returns empty string if no corrections exist.
 */
export function formatCorrectionsForPrompt(corrections: ContentCorrection[]): string {
  if (corrections.length === 0) return "";

  const lines = corrections.map((c) => {
    let line = `- ${c.rule}`;
    if (c.example_before && c.example_after) {
      line += ` (e.g., "${c.example_before}" → "${c.example_after}")`;
    }
    return line;
  });

  return `\n## Content Corrections (MUST follow these rules)\n${lines.join("\n")}\n`;
}

/**
 * Check how many existing items would be affected by a correction rule.
 * Returns counts of blog posts and social captions matching the rule text.
 */
export async function previewImpact(
  siteId: string,
  searchTerms: string[],
): Promise<{ blogPosts: number; captions: number }> {
  if (searchTerms.length === 0) return { blogPosts: 0, captions: 0 };

  let blogPosts = 0;
  let captions = 0;

  for (const term of searchTerms) {
    const pattern = `%${term}%`;

    const [blogCount] = await sql`
      SELECT COUNT(*)::int AS count FROM blog_posts
      WHERE site_id = ${siteId} AND body ILIKE ${pattern}
    `;
    blogPosts += blogCount?.count || 0;

    const [captionCount] = await sql`
      SELECT COUNT(*)::int AS count FROM social_posts sp
      JOIN social_accounts sa ON sp.account_id = sa.id
      JOIN site_social_links ssl ON ssl.social_account_id = sa.id
      WHERE ssl.site_id = ${siteId} AND sp.caption ILIKE ${pattern}
    `;
    captions += captionCount?.count || 0;
  }

  return { blogPosts, captions };
}
