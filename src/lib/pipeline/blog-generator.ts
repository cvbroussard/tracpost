import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";

const anthropic = new Anthropic();

/**
 * Generate a blog post from a triaged media asset.
 *
 * Only fires if the site has blog_enabled = true in blog_settings.
 * Uses Claude to generate a long-form article from the asset's
 * context note, AI analysis, and the site's brand voice.
 */
export async function generateBlogPost(assetId: string): Promise<string | null> {
  // Fetch asset + site + blog settings
  const [asset] = await sql`
    SELECT ma.id, ma.site_id, ma.storage_url, ma.context_note,
           ma.content_pillar, ma.ai_analysis, ma.media_type,
           s.name AS site_name, s.url AS site_url, s.brand_voice,
           bs.blog_enabled, bs.blog_title
    FROM media_assets ma
    JOIN sites s ON ma.site_id = s.id
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE ma.id = ${assetId}
  `;

  if (!asset) return null;
  if (!asset.blog_enabled) return null;

  // Check if blog post already exists for this asset
  const [existing] = await sql`
    SELECT id FROM blog_posts WHERE source_asset_id = ${assetId}
  `;
  if (existing) return existing.id;

  const brandVoice = (asset.brand_voice || {}) as Record<string, unknown>;
  const aiAnalysis = (asset.ai_analysis || {}) as Record<string, unknown>;

  const prompt = buildBlogPrompt(asset, brandVoice, aiAnalysis);

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = parseBlogResponse(text);

  const slug = generateSlug(parsed.title);

  const [post] = await sql`
    INSERT INTO blog_posts (
      site_id, source_asset_id, slug, title, body, excerpt,
      meta_title, meta_description, og_image_url, schema_json,
      tags, content_pillar, status
    ) VALUES (
      ${asset.site_id}, ${assetId}, ${slug}, ${parsed.title},
      ${parsed.body}, ${parsed.excerpt},
      ${parsed.meta_title || parsed.title},
      ${parsed.meta_description || parsed.excerpt},
      ${asset.storage_url},
      ${JSON.stringify(buildArticleSchema(parsed, asset))},
      ${parsed.tags}, ${asset.content_pillar || null},
      'draft'
    )
    RETURNING id
  `;

  return post.id;
}

/**
 * Generate blog posts for all recently triaged assets that don't have one yet.
 */
export async function generateMissingBlogPosts(siteId: string): Promise<number> {
  // Only process if blog is enabled
  const [settings] = await sql`
    SELECT blog_enabled FROM blog_settings WHERE site_id = ${siteId}
  `;
  if (!settings?.blog_enabled) return 0;

  // Find triaged assets without a blog post
  const assets = await sql`
    SELECT ma.id
    FROM media_assets ma
    LEFT JOIN blog_posts bp ON bp.source_asset_id = ma.id
    WHERE ma.site_id = ${siteId}
      AND ma.triage_status IN ('triaged', 'scheduled', 'consumed')
      AND bp.id IS NULL
    ORDER BY ma.created_at DESC
    LIMIT 5
  `;

  let generated = 0;
  for (const asset of assets) {
    try {
      const postId = await generateBlogPost(asset.id);
      if (postId) generated++;
    } catch (err) {
      console.error(
        `Blog generation failed for asset ${asset.id}:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  return generated;
}

function buildBlogPrompt(
  asset: Record<string, unknown>,
  brandVoice: Record<string, unknown>,
  aiAnalysis: Record<string, unknown>
): string {
  const parts: string[] = [];

  parts.push("You are a professional blog content writer. Generate a blog post based on a piece of visual content.");
  parts.push("");
  parts.push("## Brand");
  parts.push(`Business: ${asset.site_name} (${asset.site_url})`);
  if (brandVoice.tone) parts.push(`Tone: ${brandVoice.tone}`);
  if (brandVoice.keywords) parts.push(`Keywords to weave in: ${(brandVoice.keywords as string[]).join(", ")}`);

  parts.push("");
  parts.push("## Content Source");
  parts.push(`Content pillar: ${asset.content_pillar || "general"}`);
  if (asset.context_note) parts.push(`Creator's note: "${asset.context_note}"`);
  if (aiAnalysis.description) parts.push(`Image description: ${aiAnalysis.description}`);
  if (aiAnalysis.quality_notes) parts.push(`Quality: ${aiAnalysis.quality_notes}`);

  parts.push("");
  parts.push("## Requirements");
  parts.push("- Title: engaging, SEO-friendly, 50-70 characters");
  parts.push("- Body: 300-600 words with 2-3 subheadings (## Heading)");
  parts.push("- Write in a way that tells a story or provides value, not just describes the image");
  parts.push("- Include a call-to-action at the end");
  parts.push("- Excerpt: 1-2 sentence summary for previews");
  parts.push("- Meta description: 150-160 characters for SEO");

  parts.push("");
  parts.push("## Response Format");
  parts.push("Respond with ONLY valid JSON (no markdown fencing):");
  parts.push('{');
  parts.push('  "title": "...",');
  parts.push('  "body": "... (markdown with ## headings) ...",');
  parts.push('  "excerpt": "...",');
  parts.push('  "meta_title": "...",');
  parts.push('  "meta_description": "...",');
  parts.push('  "tags": ["tag1", "tag2", "tag3"]');
  parts.push('}');

  return parts.join("\n");
}

function parseBlogResponse(text: string): {
  title: string;
  body: string;
  excerpt: string;
  meta_title?: string;
  meta_description?: string;
  tags: string[];
} {
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      title: String(parsed.title || "Untitled"),
      body: String(parsed.body || ""),
      excerpt: String(parsed.excerpt || ""),
      meta_title: parsed.meta_title ? String(parsed.meta_title) : undefined,
      meta_description: parsed.meta_description ? String(parsed.meta_description) : undefined,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
    };
  } catch {
    return {
      title: "Untitled Post",
      body: text,
      excerpt: text.slice(0, 200),
      tags: [],
    };
  }
}

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    + `-${Date.now().toString(36)}`;
}

function buildArticleSchema(
  post: { title: string; body: string; excerpt: string; meta_description?: string },
  asset: Record<string, unknown>
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.meta_description || post.excerpt,
    image: asset.storage_url,
    author: {
      "@type": "Organization",
      name: asset.site_name,
      url: asset.site_url,
    },
    publisher: {
      "@type": "Organization",
      name: asset.site_name,
    },
    datePublished: new Date().toISOString(),
    wordCount: post.body.split(/\s+/).length,
  };
}
