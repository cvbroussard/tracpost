import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";
import { researchContextNote } from "@/lib/research/wikipedia";
import { scanContent } from "@/lib/pipeline/content-guard";

/**
 * Blog content types — determines structure, length, and prompt.
 */
type BlogContentType = "authority_overview" | "deep_dive" | "project_story" | "vendor_spotlight";

interface ContentTypeConfig {
  label: string;
  wordRange: string;
  maxTokens: number;
  description: string;
}

const CONTENT_TYPES: Record<BlogContentType, ContentTypeConfig> = {
  authority_overview: {
    label: "Authority Overview",
    wordRange: "1000-1500",
    maxTokens: 8192,
    description: "Wide coverage of capabilities told through client perspective. The 'why us' article.",
  },
  deep_dive: {
    label: "Deep Dive",
    wordRange: "800-1200",
    maxTokens: 6144,
    description: "Single topic expertise. Technical authority on one subject.",
  },
  project_story: {
    label: "Project Story",
    wordRange: "600-800",
    maxTokens: 4096,
    description: "Case study / before-after narrative. Specific client outcome.",
  },
  vendor_spotlight: {
    label: "Vendor/Material Spotlight",
    wordRange: "600-800",
    maxTokens: 4096,
    description: "Research-driven feature on a material, vendor, or technique.",
  },
};

/**
 * Classify what type of blog post to generate based on context.
 */
function classifyContentType(
  contextNote: string,
  research: string,
  existingTypes: string[]
): BlogContentType {
  // If we haven't published an authority overview recently, prioritize it
  const hasRecentAuthority = existingTypes.includes("authority_overview");
  if (!hasRecentAuthority) return "authority_overview";

  // If research found named entities (vendors, materials), do a spotlight
  if (research.length > 200) return "vendor_spotlight";

  // If context note describes a specific project outcome
  const projectSignals = /\b(before|after|reveal|completed|finished|installed|client|customer|homeowner)\b/i;
  if (projectSignals.test(contextNote)) return "project_story";

  // Default to deep dive
  return "deep_dive";
}

const anthropic = new Anthropic();

/**
 * Generate a blog post from a triaged media asset.
 *
 * If the site has a brand playbook, uses the full AI-native SEO spec:
 * voice fusion, embedding coherence, semantic chunking, monosemanticity,
 * query-aligned headings, FAQ generation, and key takeaways.
 *
 * Falls back to the basic prompt if no playbook exists.
 */
export async function generateBlogPost(assetId: string): Promise<string | null> {
  const [asset] = await sql`
    SELECT ma.id, ma.site_id, ma.storage_url, ma.context_note,
           ma.content_pillar, ma.content_tags, ma.ai_analysis, ma.media_type,
           s.name AS site_name, s.url AS site_url, s.brand_voice,
           s.brand_playbook,
           bs.blog_enabled, bs.blog_title
    FROM media_assets ma
    JOIN sites s ON ma.site_id = s.id
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE ma.id = ${assetId}
  `;

  if (!asset) return null;
  if (!asset.blog_enabled) return null;

  const [existing] = await sql`
    SELECT id FROM blog_posts WHERE source_asset_id = ${assetId}
  `;
  if (existing) return existing.id;

  const playbook = asset.brand_playbook as BrandPlaybook | null;
  const brandVoice = (asset.brand_voice || {}) as Record<string, unknown>;
  const aiAnalysis = (asset.ai_analysis || {}) as Record<string, unknown>;

  // If playbook exists, pull a hook from the bank for this post
  let hookText: string | undefined;
  if (playbook) {
    const [hook] = await sql`
      SELECT text FROM hook_bank
      WHERE site_id = ${asset.site_id}
      ORDER BY
        CASE rating WHEN 'loved' THEN 0 ELSE 1 END,
        used_count ASC, RANDOM()
      LIMIT 1
    `;
    if (hook) {
      hookText = hook.text;
      await sql`
        UPDATE hook_bank SET used_count = used_count + 1, last_used_at = NOW()
        WHERE site_id = ${asset.site_id} AND text = ${hook.text}
      `;
    }
  }

  // Query 2-3 additional images from the media library for inline use
  const inlineImages = await sql`
    SELECT storage_url, context_note, content_pillar
    FROM media_assets
    WHERE site_id = ${asset.site_id}
      AND id != ${assetId}
      AND triage_status IN ('triaged', 'scheduled')
      AND quality_score > 0.6
      AND storage_url IS NOT NULL
    ORDER BY
      CASE WHEN content_pillar = ${asset.content_pillar || ''} THEN 0 ELSE 1 END,
      quality_score DESC
    LIMIT 3
  `;

  const imageUrls = inlineImages.map((img: Record<string, unknown>) => ({
    url: img.storage_url as string,
    context: img.context_note as string || "",
  }));

  // Fetch existing post titles to avoid duplication
  const existingPosts = await sql`
    SELECT title FROM blog_posts WHERE site_id = ${asset.site_id} ORDER BY created_at DESC LIMIT 20
  `;
  const existingTitles = existingPosts.map((p) => p.title as string);

  // Collect already-used external image URLs for dedup
  const usedImageRows = await sql`
    SELECT body FROM blog_posts
    WHERE site_id = ${asset.site_id} AND status IN ('draft', 'published')
  `;
  const usedImageUrls: string[] = [];
  for (const row of usedImageRows) {
    const matches = ((row.body as string) || "").match(/!\[.*?\]\((https?:\/\/upload\.wikimedia[^)]+)\)/g) || [];
    for (const m of matches) {
      const url = m.match(/\((https?:\/\/[^)]+)\)/)?.[1];
      if (url) usedImageUrls.push(url);
    }
  }

  // Research entities mentioned in the context note
  const researchResult = await researchContextNote((asset.context_note as string) || "", usedImageUrls, asset.site_id as string);
  const research = researchResult.text;

  // Fetch vendor URLs linked to this asset (from vendor table)
  const assetVendors = await sql`
    SELECT v.name, v.url
    FROM asset_vendors av
    JOIN vendors v ON v.id = av.vendor_id
    WHERE av.asset_id = ${assetId}
  `;
  const vendorLinks: string[] = [];
  for (const v of assetVendors) {
    if (v.url) vendorLinks.push(`${v.name}: ${v.url}`);
  }

  // Extract inline URLs from context note and associate with nearest vendor
  const contextNote = (asset.context_note as string) || "";
  const inlineUrls = contextNote.match(/https?:\/\/[^\s,]+/g) || [];
  for (const url of inlineUrls) {
    // Check if this URL is already covered by a vendor link
    const alreadyCovered = vendorLinks.some((vl) => vl.includes(url));
    if (!alreadyCovered) {
      // Try to match URL domain to a tagged vendor
      try {
        const domain = new URL(url).hostname.replace(/^www\./, "");
        const matchedVendor = assetVendors.find((v: Record<string, unknown>) =>
          v.url && (v.url as string).includes(domain)
        );
        if (matchedVendor) {
          vendorLinks.push(`${matchedVendor.name}: ${url}`);
        } else {
          vendorLinks.push(url);
        }
      } catch {
        vendorLinks.push(url);
      }
    }
  }

  // Cap vendor links to avoid over-linking — inline deep links get priority
  const MAX_VENDOR_LINKS = 3;
  if (vendorLinks.length > MAX_VENDOR_LINKS) {
    // Inline URLs (deep links from context note) are more specific — keep those first
    const deepLinks = vendorLinks.filter((l) => l.includes("/", l.indexOf("://") + 3));
    const baseLinks = vendorLinks.filter((l) => !deepLinks.includes(l));
    const capped = [...deepLinks, ...baseLinks].slice(0, MAX_VENDOR_LINKS);
    vendorLinks.length = 0;
    vendorLinks.push(...capped);
  }

  // Classify content type based on context
  const existingTypeRows = await sql`
    SELECT DISTINCT content_type
    FROM blog_posts WHERE site_id = ${asset.site_id} AND status IN ('published', 'draft')
  `;
  const existingContentTypes = existingTypeRows
    .map((r) => r.content_type as string)
    .filter(Boolean);

  const contentType = playbook
    ? classifyContentType((asset.context_note as string) || "", research, existingContentTypes)
    : "deep_dive" as BlogContentType;

  const typeConfig = CONTENT_TYPES[contentType];

  const prompt = playbook
    ? buildTypedBlogPrompt(contentType, asset, playbook, aiAnalysis, hookText, imageUrls, existingTitles, research, vendorLinks)
    : buildBasicBlogPrompt(asset, brandVoice, aiAnalysis, imageUrls);

  const response = await anthropic.messages.create({
    model: playbook ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001",
    max_tokens: playbook ? typeConfig.maxTokens : 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = parseBlogResponse(text);

  // Replace image placeholders with real URLs
  // Placeholders map 1:1 to inlineImages (not the seed asset — that's the OG image only)
  for (let i = 0; i < imageUrls.length; i++) {
    const n = i + 1;
    const pattern = new RegExp(`\\{\\{IMAGE_${n}\\}\\}|\\{IMAGE_${n}\\}|IMAGE_${n}`, "g");
    parsed.body = parsed.body.replace(pattern, imageUrls[i].url);
  }

  // Fix any corrupted assets.tracpost.com URLs the AI may have mangled
  // Collect all known valid URLs (subscriber images + editorial images from research)
  const allImages = [
    { url: asset.storage_url as string },
    ...imageUrls,
  ];
  const validUrls = allImages.map((img) => img.url);
  const editorialMatches = research.match(/https:\/\/assets\.tracpost\.com\/[^\s)]+/g) || [];
  validUrls.push(...editorialMatches);

  // Replace any malformed tracpost URLs with the closest valid match
  parsed.body = parsed.body.replace(
    /https:\/\/assets\.tracpost\.com\/[^\s)"]+/g,
    (found) => {
      if (validUrls.includes(found)) return found;
      // Find closest match by longest common prefix
      let best = found;
      let bestLen = 0;
      for (const valid of validUrls) {
        let common = 0;
        while (common < found.length && common < valid.length && found[common] === valid[common]) common++;
        if (common > bestLen) { bestLen = common; best = valid; }
      }
      return bestLen > 40 ? best : found; // Only fix if strong match
    }
  );

  // Content safety scan — flag issues before storing
  const guard = await scanContent(
    parsed.title,
    parsed.body,
    (asset.site_name as string) || ""
  );
  const postStatus = guard.pass ? "draft" : "flagged";

  const slug = generateSlug(parsed.title);

  const [post] = await sql`
    INSERT INTO blog_posts (
      site_id, source_asset_id, slug, title, body, excerpt,
      meta_title, meta_description, og_image_url, schema_json,
      tags, content_pillar, content_type, status
    ) VALUES (
      ${asset.site_id}, ${assetId}, ${slug}, ${parsed.title},
      ${parsed.body}, ${parsed.excerpt},
      ${parsed.meta_title || parsed.title},
      ${parsed.meta_description || parsed.excerpt},
      ${asset.storage_url},
      ${JSON.stringify(buildArticleSchema(parsed, asset))},
      ${parsed.tags}, ${asset.content_pillar || null},
      ${contentType},
      ${postStatus}
    )
    RETURNING id
  `;

  // Store metadata: guard flags + editorial image manifests
  const metadata: Record<string, unknown> = {};
  if (!guard.pass && guard.flags.length > 0) {
    metadata.guard_flags = guard.flags;
  }
  if (researchResult.editorialImages.length > 0) {
    metadata.editorial_images = researchResult.editorialImages;
  }
  if (Object.keys(metadata).length > 0) {
    await sql`
      UPDATE blog_posts
      SET metadata = ${JSON.stringify(metadata)}::jsonb
      WHERE id = ${post.id}
    `;
  }

  return post.id;
}

/**
 * Generate a blog post from a content topic (playbook-driven).
 * Pulls from content_topics queue instead of media assets.
 */
export async function generateBlogFromTopic(topicId: string): Promise<string | null> {
  const [topic] = await sql`
    SELECT ct.id, ct.site_id, ct.title AS topic_title, ct.search_query,
           ct.intent, ct.pillar, ct.cluster,
           s.name AS site_name, s.url AS site_url, s.brand_playbook
    FROM content_topics ct
    JOIN sites s ON ct.site_id = s.id
    WHERE ct.id = ${topicId} AND ct.status = 'queued'
  `;

  if (!topic) return null;

  const playbook = topic.brand_playbook as BrandPlaybook | null;
  if (!playbook) return null;

  // Pull a hook
  let hookText: string | undefined;
  const [hook] = await sql`
    SELECT text FROM hook_bank
    WHERE site_id = ${topic.site_id}
    ORDER BY CASE rating WHEN 'loved' THEN 0 ELSE 1 END, used_count ASC, RANDOM()
    LIMIT 1
  `;
  if (hook) {
    hookText = hook.text;
    await sql`
      UPDATE hook_bank SET used_count = used_count + 1, last_used_at = NOW()
      WHERE site_id = ${topic.site_id} AND text = ${hook.text}
    `;
  }

  // Query images from media library for inline use
  const inlineImages = await sql`
    SELECT storage_url, context_note
    FROM media_assets
    WHERE site_id = ${topic.site_id}
      AND triage_status IN ('triaged', 'scheduled')
      AND quality_score > 0.6
      AND storage_url IS NOT NULL
    ORDER BY
      CASE WHEN content_pillar = ${topic.pillar || ''} THEN 0 ELSE 1 END,
      quality_score DESC
    LIMIT 3
  `;

  const imageUrls = inlineImages.map((img: Record<string, unknown>) => ({
    url: img.storage_url as string,
    context: img.context_note as string || "",
  }));

  // Fetch existing post titles to avoid duplication
  const existingPosts = await sql`
    SELECT title FROM blog_posts WHERE site_id = ${topic.site_id} ORDER BY created_at DESC LIMIT 20
  `;
  const existingTitles = existingPosts.map((p) => p.title as string);

  const prompt = buildTopicBlogPrompt(topic, playbook, hookText, imageUrls, existingTitles);

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 6144,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const parsed = parseBlogResponse(text);
  const slug = generateSlug(parsed.title);

  // Check blog_enabled
  const [settings] = await sql`
    SELECT blog_enabled FROM blog_settings WHERE site_id = ${topic.site_id}
  `;
  if (!settings?.blog_enabled) return null;

  const [post] = await sql`
    INSERT INTO blog_posts (
      site_id, slug, title, body, excerpt,
      meta_title, meta_description, schema_json,
      tags, content_pillar, status
    ) VALUES (
      ${topic.site_id}, ${slug}, ${parsed.title},
      ${parsed.body}, ${parsed.excerpt},
      ${parsed.meta_title || parsed.title},
      ${parsed.meta_description || parsed.excerpt},
      ${JSON.stringify(buildTopicArticleSchema(parsed, topic))},
      ${parsed.tags}, ${topic.pillar || null},
      'draft'
    )
    RETURNING id
  `;

  // Link topic to post
  await sql`
    UPDATE content_topics
    SET status = 'generated', blog_post_id = ${post.id}
    WHERE id = ${topicId}
  `;

  return post.id;
}

/**
 * Generate blog posts for all recently triaged assets that don't have one yet.
 */
export async function generateMissingBlogPosts(siteId: string): Promise<number> {
  const [settings] = await sql`
    SELECT blog_enabled FROM blog_settings WHERE site_id = ${siteId}
  `;
  if (!settings?.blog_enabled) return 0;

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

// ── Type-Specific Blog Prompt ─────────────────────────────────────

function buildTypedBlogPrompt(
  contentType: BlogContentType,
  asset: Record<string, unknown>,
  playbook: BrandPlaybook,
  aiAnalysis: Record<string, unknown>,
  hookText?: string,
  inlineImages?: Array<{ url: string; context: string }>,
  existingTitles?: string[],
  research?: string,
  vendorLinks?: string[]
): string {
  const { audienceResearch, brandPositioning, offerCore } = playbook;
  const angle = brandPositioning.selectedAngles[0];
  const lang = audienceResearch.languageMap;
  const typeConfig = CONTENT_TYPES[contentType];

  // Type-specific writing instructions
  const typeInstructions: Record<BlogContentType, string> = {
    authority_overview: `## Article Type: Authority Overview ("Why Us")
This is the flagship article — a wide tour of capabilities told through the client's perspective.

Structure:
1. Hook — the one thing this business does that no one else does (2-3 sentences)
2. Brief overview sections (1-2 paragraphs each) covering the key capability areas:
   - How they approach the work differently (methodology/process)
   - Layouts, workflow, and spatial design
   - Equipment, appliances, and performance infrastructure
   - Materials, surfaces, and finishes
   - Craftsmanship, custom features, and vendor partnerships
   - Utility infrastructure (electrical, plumbing, ventilation)
3. The outcome — what the finished result feels like to use
4. Subtle CTA woven into the closing

Each section should be wide, not deep — a taste that makes the reader want to learn more.
Link to deeper articles where they exist. This article is the hub.
Tone: confident generalist, not narrow specialist. "We do all of this, and here's a glimpse of each."`,

    deep_dive: `## Article Type: Deep Dive
Single topic technical authority. Go deep on one subject.

Structure:
1. Hook — why this specific topic matters more than people think
2. The problem most people don't realize they have
3. The technical detail — explain it clearly, no jargon, but don't dumb it down
4. How this business approaches it differently
5. FAQ (3-4 questions)
6. Key takeaways (3-4 points)

Tone: subject matter expert talking to an informed peer.`,

    project_story: `## Article Type: Project Story
A narrative about a specific project, client, or transformation.

Structure:
1. The client's situation before (frustration, limitation, what triggered the project)
2. The discovery — what the team observed or learned
3. The key design decisions and why each one was made
4. The outcome — how the space performs now
5. One unexpected benefit the client didn't anticipate

Write as a story with a narrative arc. Use specific details — dimensions, materials, vendor names.
Do NOT use client's real name — use "our client" or "a client in [neighborhood]".
Tone: storyteller sharing a war story with genuine enthusiasm.`,

    vendor_spotlight: `## Article Type: Vendor/Material Spotlight
A research-driven feature about a specific material, vendor, technique, or product.

Structure:
1. Open with the material/vendor in context — how you encountered it, why you chose it
2. The history and origin (use the research provided)
3. What makes it special — technical properties, craftsmanship, uniqueness
4. How it performs in real use — not just how it looks, but how it functions
5. Why your business specifically chooses to work with this material/vendor
6. What clients should know before requesting it

Include any research images provided — they add visual credibility.
Tone: curator introducing something they genuinely respect.`,
  };

  return `Write an article for a local service business blog. Length: ${typeConfig.wordRange} words. No filler.

${typeInstructions[contentType]}

## Content Source
Content pillar: ${asset.content_pillar || "general"}
${asset.context_note ? `Creator's note: "${asset.context_note}"` : ""}
${aiAnalysis.description ? `Visual context: ${aiAnalysis.description}` : ""}
${hookText ? `Opening hook to weave in: "${hookText}"` : ""}

## Research Instructions
If the creator's note references specific brands, vendors, products, materials, or techniques:
- Research the named entity. Include factual details: origin, craftsmanship, history.
- Name things specifically — not generically.
- Position the business's choice to work with them as intentional and quality-driven.
- Never fabricate facts about real companies or products.
${research ? `\n## Background Research (from Wikipedia)\n${research}` : ""}
${vendorLinks && vendorLinks.length > 0
  ? `\n## Vendor/Partner Links (link to these in the article where naturally relevant)\n${vendorLinks.join("\n")}`
  : ""}

## Brand Context
Business: ${asset.site_name} (${asset.site_url})
Brand angle: "${angle?.name || "general"}" — ${angle?.tagline || ""}
Tone: ${angle?.tone || "professional, engaging"}
Offer: ${offerCore.offerStatement.emotionalCore}

## Audience
Their pain: ${lang.painPhrases.slice(0, 3).join("; ")}
Their desire: ${lang.desirePhrases.slice(0, 3).join("; ")}
Target search query: ${lang.searchPhrases[Math.floor(Math.random() * lang.searchPhrases.length)] || ""}

## Available Images
Place images at natural points using markdown: ![brief alt text](IMAGE_PLACEHOLDER)
IMPORTANT: Use EXACTLY these placeholder tokens as the URL — do NOT modify them.
${inlineImages && inlineImages.length > 0
  ? inlineImages.map((img, i) => `{{IMAGE_${i + 1}}}${img.context ? ` — ${img.context}` : ""}`).join("\n")
  : "No images available — text only."}

${existingTitles && existingTitles.length > 0
  ? `## ALREADY PUBLISHED (do NOT reuse these titles or similar phrasing)\n${existingTitles.map(t => `- ${t}`).join("\n")}\n`
  : ""}

## Writing Rules
- Title: 40-60 characters. Specific and unique. Lead with the insight, not the category.
- Open with a hook or story — not a definition.
- 9th-grade reading level. Conversational, not academic.
- Use the audience's language naturally.
- 3-5 headings as ## (at least one as a question).
- Paragraphs over bullet lists.
- NEVER include specific prices, dollar amounts, cost estimates, or price ranges. No "$80,000", no "starting at $X", no "typically costs". Let the reader inquire.
- Link to vendor/partner websites where provided. Also include 1 outbound link to an authoritative, non-competitor source.

## Response Format
Respond with ONLY valid JSON (no markdown fencing):
{
  "title": "<40-60 chars, unique>",
  "body": "<${typeConfig.wordRange} word markdown article>",
  "excerpt": "<1-2 sentence summary>",
  "meta_title": "<max 60 characters>",
  "meta_description": "<max 155 characters>",
  "tags": ["<3-5 relevant tags>"]
}`;
}

// ── Legacy Playbook Blog Prompt (kept for backward compat) ────────

function buildPlaybookBlogPrompt(
  asset: Record<string, unknown>,
  playbook: BrandPlaybook,
  aiAnalysis: Record<string, unknown>,
  hookText?: string,
  inlineImages?: Array<{ url: string; context: string }>,
  existingTitles?: string[],
  research?: string
): string {
  const { audienceResearch, brandPositioning, offerCore } = playbook;
  const angle = brandPositioning.selectedAngles[0];
  const lang = audienceResearch.languageMap;

  return `Write an article for a local service business blog. Length: 800-1200 words. No filler, no padding.

## Content Source
Content pillar: ${asset.content_pillar || "general"}
${asset.context_note ? `Creator's note: "${asset.context_note}"` : ""}
${aiAnalysis.description ? `Visual context: ${aiAnalysis.description}` : ""}
${hookText ? `Opening hook to weave in: "${hookText}"` : ""}

## Research Instructions
The creator's note may reference specific brands, vendors, products, materials, or techniques by name. If so:
- **Research the named entity** using your knowledge. Include factual details: origin, craftsmanship, history, what makes it notable.
- **Weave the story** into the article. A "Mitchel & Mitchel custom hood" isn't just a hood — it's a partnership, a craft, a design choice with reasoning.
- **Name materials specifically**: Zellige is Moroccan hand-cut glazed tile from Fez, each piece unique. Don't just say "handcrafted tile."
- If the entity is a vendor/brand, position the business's choice to work with them as a signal of quality and intentionality.
- If you don't have knowledge about a specific entity, focus on the category and craftsmanship — never fabricate facts about real companies.
${research ? `\n## Background Research (from Wikipedia)\n${research}` : ""}

## Brand Context
Business: ${asset.site_name} (${asset.site_url})
Brand angle: "${angle?.name || "general"}" — ${angle?.tagline || ""}
Tone: ${angle?.tone || "professional, engaging"}
Offer: ${offerCore.offerStatement.emotionalCore}

## Audience
Their pain: ${lang.painPhrases.slice(0, 3).join("; ")}
Their desire: ${lang.desirePhrases.slice(0, 3).join("; ")}
Target search query: ${lang.searchPhrases[Math.floor(Math.random() * lang.searchPhrases.length)] || ""}

## Available Images
Place 2-3 images at natural points using markdown: ![brief alt text](IMAGE_PLACEHOLDER)
IMPORTANT: Use EXACTLY these placeholder tokens as the URL — do NOT modify them.
${inlineImages && inlineImages.length > 0
  ? inlineImages.map((img, i) => `{{IMAGE_${i + 1}}}${img.context ? ` — ${img.context}` : ""}`).join("\n")
  : "No images available — text only."}

${existingTitles && existingTitles.length > 0
  ? `## ALREADY PUBLISHED (do NOT reuse these titles or similar phrasing)\n${existingTitles.map(t => `- ${t}`).join("\n")}\n`
  : ""}

## Writing Rules
- Title: 40-60 characters. Specific and unique. Do NOT start with the city name or "Chef's Kitchen." Lead with the insight, technique, or outcome.
- Open with a hook or story — not a definition.
- Write at a 9th-grade reading level. Conversational, not academic.
- Use the audience's language naturally — don't force keywords.
- 3-5 headings as ## (at least one as a question).
- Paragraphs, not bullet lists. Dense and complete per paragraph.
- NEVER include specific prices, dollar amounts, cost estimates, or price ranges. Let the reader inquire.
- End with a brief FAQ (3-4 Q&As) and 3-4 key takeaways.
- Include 1 outbound link to an authoritative, non-competitor source.
- Internal links: if relevant, link to other articles on the same blog.

## Response Format
Respond with ONLY valid JSON (no markdown fencing):
{
  "title": "<40-60 chars, unique, specific, NOT similar to existing titles>",
  "body": "<800-1200 word markdown article>",
  "excerpt": "<1-2 sentence summary>",
  "meta_title": "<max 60 characters>",
  "meta_description": "<max 155 characters>",
  "tags": ["<3-5 relevant tags>"]
}`;
}

// ── Topic-Driven Blog Prompt ───────────────────────────────────────

function buildTopicBlogPrompt(
  topic: Record<string, unknown>,
  playbook: BrandPlaybook,
  hookText?: string,
  inlineImages?: Array<{ url: string; context: string }>,
  existingTitles?: string[]
): string {
  const { audienceResearch, brandPositioning, offerCore } = playbook;
  const angle = brandPositioning.selectedAngles[0];
  const lang = audienceResearch.languageMap;

  return `Write an article for a local service business blog. Length: 800-1200 words. No filler, no padding.

## Topic
Subject: "${topic.topic_title}"
Target search query: "${topic.search_query}"
Search intent: ${topic.intent}
Content pillar: ${topic.pillar || "general"}
${hookText ? `Opening hook to weave in: "${hookText}"` : ""}

## Brand Context
Business: ${topic.site_name} (${topic.site_url})
Brand angle: "${angle?.name || "general"}" — ${angle?.tagline || ""}
Tone: ${angle?.tone || "professional, engaging"}
Offer: ${offerCore.offerStatement.emotionalCore}

## Audience
Their pain: ${lang.painPhrases.slice(0, 3).join("; ")}
Their desire: ${lang.desirePhrases.slice(0, 3).join("; ")}
What they've tried that didn't work: ${audienceResearch.urgencyGateway.failedSolutions.slice(0, 2).join("; ")}

## Research Instructions
If the topic references specific brands, products, materials, techniques, or industry terms:
- Research the entity using your knowledge. Include factual details: origin, process, craftsmanship, history.
- Name things specifically — "Zellige tile from Fez, Morocco" not "handcrafted tile."
- Position the business's expertise with these materials/techniques as a differentiator.
- Never fabricate facts about real companies or products.

## Available Images
Place 2-3 images at natural points using markdown: ![brief alt text](IMAGE_PLACEHOLDER)
IMPORTANT: Use EXACTLY these placeholder tokens as the URL — do NOT modify them.
${inlineImages && inlineImages.length > 0
  ? inlineImages.map((img, i) => `{{IMAGE_${i + 1}}}${img.context ? ` — ${img.context}` : ""}`).join("\n")
  : "No images available — text only."}

${existingTitles && existingTitles.length > 0
  ? `## ALREADY PUBLISHED (do NOT reuse these titles or similar phrasing)\n${existingTitles.map(t => `- ${t}`).join("\n")}\n`
  : ""}

## Writing Rules
- Title: 40-60 characters. Specific and unique. Do NOT start with the city name or repeat the business category. Lead with the insight, technique, or outcome.
- Open with a hook or story — not a definition.
- Write at a 9th-grade reading level. Conversational, not academic.
- Use the audience's language naturally — don't force keywords.
- 3-5 headings as ## (at least one as a question).
- Paragraphs, not bullet lists. Dense and complete per paragraph.
- NEVER include specific prices, dollar amounts, cost estimates, or price ranges. Let the reader inquire.
- End with a brief FAQ (3-4 Q&As) and 3-4 key takeaways.
- Include 1 outbound link to an authoritative, non-competitor source.

## Response Format
Respond with ONLY valid JSON (no markdown fencing):
{
  "title": "<40-60 chars, unique, specific, NOT similar to existing titles>",
  "body": "<800-1200 word markdown article>",
  "excerpt": "<1-2 sentence summary>",
  "meta_title": "<max 60 characters>",
  "meta_description": "<max 155 characters>",
  "tags": ["<3-5 relevant tags>"]
}`;
}

// ── Basic Blog Prompt (No Playbook) ────────────────────────────────

function buildBasicBlogPrompt(
  asset: Record<string, unknown>,
  brandVoice: Record<string, unknown>,
  aiAnalysis: Record<string, unknown>,
  inlineImages?: Array<{ url: string; context: string }>
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

  if (inlineImages && inlineImages.length > 0) {
    parts.push("");
    parts.push("## Available Images");
    parts.push("Place 2-3 images using markdown: ![description](IMAGE_PLACEHOLDER)");
    parts.push("IMPORTANT: Use EXACTLY these placeholder tokens as the URL — do NOT modify them.");
    inlineImages.forEach((img, i) => {
      parts.push(`{{IMAGE_${i + 1}}}${img.context ? ` — ${img.context}` : ""}`);
    });
  }

  parts.push("");
  parts.push("## Requirements");
  parts.push("- Title: engaging, SEO-friendly, 50-70 characters");
  parts.push("- Body: 300-600 words with 2-3 subheadings (## Heading)");
  parts.push("- Write in a way that tells a story or provides value, not just describes the image");
  parts.push("- Include a call-to-action at the end");
  parts.push("- Include 1-2 outbound links to authoritative, non-competitor sources using [anchor text](url)");
  parts.push("- Excerpt: 1-2 sentence summary for previews");
  parts.push("- Meta description: 150-160 characters for SEO");

  parts.push("");
  parts.push("## Response Format");
  parts.push("Respond with ONLY valid JSON (no markdown fencing):");
  parts.push("{");
  parts.push('  "title": "...",');
  parts.push('  "body": "... (markdown with ## headings) ...",');
  parts.push('  "excerpt": "...",');
  parts.push('  "meta_title": "...",');
  parts.push('  "meta_description": "...",');
  parts.push('  "tags": ["tag1", "tag2", "tag3"]');
  parts.push("}");

  return parts.join("\n");
}

// ── Shared Helpers ─────────────────────────────────────────────────

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
    // JSON parse failed — try to salvage fields from the raw text
    const titleMatch = cleaned.match(/"title"\s*:\s*"([^"]+)"/);
    const bodyMatch = cleaned.match(/"body"\s*:\s*"([\s\S]+?)"\s*,\s*"excerpt"/);
    const excerptMatch = cleaned.match(/"excerpt"\s*:\s*"([^"]+)"/);

    if (bodyMatch) {
      // Unescape the extracted body string
      const body = bodyMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      return {
        title: titleMatch ? titleMatch[1] : "Untitled Post",
        body,
        excerpt: excerptMatch ? excerptMatch[1] : body.slice(0, 200),
        tags: [],
      };
    }

    // Complete fallback — strip JSON artifacts and use as body
    const stripped = cleaned
      .replace(/^\s*\{?\s*"title"\s*:.*$/m, "")
      .replace(/^\s*"body"\s*:\s*"/m, "")
      .replace(/"\s*,\s*"excerpt"[\s\S]*$/m, "")
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .trim();

    return {
      title: titleMatch ? titleMatch[1] : "Untitled Post",
      body: stripped || text,
      excerpt: stripped.slice(0, 200),
      tags: [],
    };
  }
}

function generateSlug(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) + `-${Date.now().toString(36)}`
  );
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

function buildTopicArticleSchema(
  post: { title: string; body: string; excerpt: string; meta_description?: string },
  topic: Record<string, unknown>
): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.meta_description || post.excerpt,
    author: {
      "@type": "Organization",
      name: topic.site_name,
      url: topic.site_url,
    },
    publisher: {
      "@type": "Organization",
      name: topic.site_name,
    },
    datePublished: new Date().toISOString(),
    wordCount: post.body.split(/\s+/).length,
  };
}
