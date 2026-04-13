/**
 * Project blog article generator.
 *
 * Produces blog articles from project assets and captions.
 * Deep-links to the project preview page.
 * Uses project snapshot for context, site brand voice for tone.
 */
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { buildProjectSnapshot } from "./project-captions";
import { projectUrl as buildProjectUrl } from "@/lib/urls";

const anthropic = new Anthropic();

interface ArticlePrompt {
  title: string;
  angle: string;
  assetHint: string; // caption fragment to match for featured image
}

interface ProjectAsset {
  id: string;
  storage_url: string;
  context_note: string | null;
  date_taken: string | null;
  created_at: string;
}

interface ProjectBlogResult {
  title: string;
  body: string;
  excerpt: string;
  assets: ProjectAsset[];
  featuredAssetId: string;
}

/**
 * Generate a blog article about a project.
 * Selects key assets from the timeline, weaves them into a narrative.
 */
export async function generateProjectArticle(
  projectId: string,
  siteId: string
): Promise<ProjectBlogResult | null> {
  // Fetch project details
  const [project] = await sql`
    SELECT id, name, slug, description, address, start_date, end_date, status
    FROM projects WHERE id = ${projectId}
  `;
  if (!project) { console.error("Project not found:", projectId); return null; }

  // Build snapshot for context
  const snapshot = await buildProjectSnapshot(projectId);
  console.log("Project snapshot built, brands:", snapshot.brands.length, "captions:", snapshot.sampleCaptions.length);

  // Fetch site for brand voice + URL context
  const [site] = await sql`
    SELECT s.name, s.brand_voice, s.content_vibe, s.url, s.blog_slug,
           bs.custom_domain
    FROM sites s
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE s.id = ${siteId}
  `;

  // Fetch captioned assets chronologically
  const assets = await sql`
    SELECT ma.id, ma.storage_url, ma.context_note, ma.date_taken, ma.created_at
    FROM media_assets ma
    JOIN asset_projects ap ON ap.asset_id = ma.id
    WHERE ap.project_id = ${projectId}
      AND ma.context_note IS NOT NULL
      AND ma.context_note != ''
      AND ma.triage_status = 'triaged'
    ORDER BY ma.sort_order ASC NULLS LAST
  `;

  console.log("Project assets found:", assets.length);
  if (assets.length < 3) { console.error("Not enough captioned assets:", assets.length); return null; }

  // Select key assets for the article — first, middle highlights, last
  const selectedAssets = selectKeyAssets(assets as ProjectAsset[]);

  // Build asset descriptions for the prompt
  const assetDescriptions = selectedAssets.map((a, i) => {
    const date = a.date_taken
      ? new Date(a.date_taken).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : null;
    return `{{IMAGE_${i + 1}}}${date ? ` [${date}]` : ""}: ${a.context_note}`;
  }).join("\n");

  // Build the prompt
  const brandVoice = (site?.brand_voice || {}) as Record<string, unknown>;
  const contentVibe = (site?.content_vibe as string) || "";
  const projectUrl = buildProjectUrl(
    String(site?.blog_slug || ""),
    String(project.slug),
    site?.custom_domain ? String(site.custom_domain) : null
  );

  const startDate = project.start_date
    ? new Date(project.start_date as string).toLocaleDateString("en-US", { year: "numeric", month: "long" })
    : null;
  const endDate = project.end_date
    ? new Date(project.end_date as string).toLocaleDateString("en-US", { year: "numeric", month: "long" })
    : null;
  const duration = startDate && endDate ? `${startDate} — ${endDate}` : null;

  const prompt = `Write a blog article about a real project completed by ${site?.name || "our team"}.

## Project Details
- **Name**: ${project.name}
- **Description**: ${project.description || "A renovation project"}
${duration ? `- **Timeline**: ${duration}` : ""}
${project.address ? `- **Location**: ${project.address}` : ""}
- **Status**: ${project.status}
${snapshot.brands.length > 0 ? `- **Materials/Brands**: ${snapshot.brands.join(", ")}` : ""}

## Project Photos (in chronological order)
${assetDescriptions}

## Writing Guidelines
${contentVibe ? `Content vibe: ${contentVibe}` : ""}
${brandVoice.tone ? `Brand tone: ${brandVoice.tone}` : ""}
${snapshot.vocabulary.length > 0 ? `Domain vocabulary: ${snapshot.vocabulary.join(", ")}` : ""}

Write an article that:
1. Tells the story of this project from start to finish using the photos as narrative anchors
2. References each photo naturally in the text using {{IMAGE_N}} placeholders where they should appear
3. Highlights the craftsmanship, materials, and process — not marketing fluff
4. Includes specific details from the photo captions (dates, materials, techniques)
5. Ends with a link to the full project gallery: [View the complete ${project.name} project](${projectUrl})

Format:
- Title on the first line (no # prefix)
- One blank line
- Body in markdown (## for sections, **bold** for emphasis)
- Include all ${selectedAssets.length} image placeholders ({{IMAGE_1}} through {{IMAGE_${selectedAssets.length}}})
- 600-1000 words
- Do NOT start with "In this article" or similar meta-references
- Write as if documenting real work for an audience that appreciates craft`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
    if (!text) return null;

    // Parse title and body
    const lines = text.split("\n");
    const title = lines[0].replace(/^#\s*/, "").trim();
    const body = lines.slice(1).join("\n").trim();

    // Generate excerpt
    const plainText = body.replace(/[#*\[\](){}]/g, "").replace(/\n+/g, " ").trim();
    const excerpt = plainText.slice(0, 200).replace(/\s\S*$/, "...");

    // Replace image placeholders with actual URLs
    let finalBody = body;
    for (let i = 0; i < selectedAssets.length; i++) {
      const placeholder = `{{IMAGE_${i + 1}}}`;
      const asset = selectedAssets[i];
      const alt = (asset.context_note || "").replace(/"/g, "'");
      const imageMarkdown = `\n\n![${alt}](${asset.storage_url})\n\n`;
      finalBody = finalBody.replace(placeholder, imageMarkdown);
    }

    // Also handle bare IMAGE_N without braces
    for (let i = 0; i < selectedAssets.length; i++) {
      const bare = `IMAGE_${i + 1}`;
      const asset = selectedAssets[i];
      const alt = (asset.context_note || "").replace(/"/g, "'");
      const imageMarkdown = `\n\n![${alt}](${asset.storage_url})\n\n`;
      finalBody = finalBody.replace(new RegExp(`\\{?\\{?${bare}\\}?\\}?`, "g"), imageMarkdown);
    }

    // Strip any AI-hallucinated image URLs that aren't our placeholders
    const allowedUrls = new Set(selectedAssets.map((a) => a.storage_url));
    finalBody = finalBody.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
      if (allowedUrls.has(url)) return match;
      // Remove hallucinated image
      return "";
    });

    // Pick featured image: middle of timeline (most likely to show work in progress)
    const featuredIndex = Math.floor(selectedAssets.length / 2);

    return {
      title,
      body: finalBody,
      excerpt,
      assets: selectedAssets,
      featuredAssetId: selectedAssets[featuredIndex]?.id || selectedAssets[0]?.id,
    };
  } catch (err) {
    console.error("Project blog generation error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Select key assets for the article — spread across the timeline.
 * Picks first, last, and evenly distributed middle assets.
 * Max 6 images per article.
 */
function selectKeyAssets(assets: ProjectAsset[]): ProjectAsset[] {
  if (assets.length <= 6) return assets;

  const selected: ProjectAsset[] = [assets[0]]; // First
  const remaining = assets.length - 2;
  const step = Math.floor(remaining / 4);

  for (let i = 1; i <= 4 && i * step < assets.length - 1; i++) {
    selected.push(assets[i * step]);
  }

  selected.push(assets[assets.length - 1]); // Last
  return selected;
}

/**
 * Select assets most relevant to an article angle.
 * Scores each asset's caption against the angle description.
 */
function selectAssetsForAngle(assets: ProjectAsset[], angle: string, assetHint: string): ProjectAsset[] {
  // Score each asset by keyword overlap with the angle + hint
  const angleWords = new Set(
    (angle + " " + assetHint).toLowerCase().match(/[a-z][a-z'-]+/g) || []
  );

  const scored = assets.map((a) => {
    const captionWords = (a.context_note || "").toLowerCase().match(/[a-z][a-z'-]+/g) || [];
    const overlap = captionWords.filter((w) => angleWords.has(w)).length;
    return { asset: a, score: overlap };
  });

  scored.sort((a, b) => b.score - a.score);

  // Take top 6, but ensure chronological order
  const topAssets = scored.slice(0, 6).map((s) => s.asset);
  topAssets.sort((a, b) => {
    const dateA = new Date(a.date_taken || a.created_at).getTime();
    const dateB = new Date(b.date_taken || b.created_at).getTime();
    return dateA - dateB;
  });

  return topAssets;
}

/**
 * Generate article prompts (angles) for a project.
 * Reads all captions and identifies the most compelling narrative threads.
 * Stores on the project for repeated use.
 */
export async function generateArticlePrompts(
  projectId: string
): Promise<ArticlePrompt[]> {
  const [project] = await sql`
    SELECT id, name, description, address, start_date, end_date
    FROM projects WHERE id = ${projectId}
  `;
  if (!project) return [];

  const snapshot = await buildProjectSnapshot(projectId);

  // Get all captions for analysis
  const assets = await sql`
    SELECT context_note, date_taken
    FROM media_assets ma
    JOIN asset_projects ap ON ap.asset_id = ma.id
    WHERE ap.project_id = ${projectId}
      AND ma.context_note IS NOT NULL AND ma.context_note != ''
    ORDER BY ma.sort_order ASC NULLS LAST
  `;

  const captionList = assets.map((a) => {
    const date = a.date_taken ? new Date(a.date_taken as string).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "";
    return `${date ? `[${date}] ` : ""}${a.context_note}`;
  }).join("\n");

  const prompt = `You are analyzing a construction/renovation project to identify compelling blog article angles.

Project: ${project.name}
${project.description ? `Description: ${project.description}` : ""}
${snapshot.brands.length > 0 ? `Materials/Brands: ${snapshot.brands.join(", ")}` : ""}

Timeline of captioned photos from this project:
${captionList}

Identify 10-15 distinct article angles from this project. Each angle should be:
- Specific to something that actually happened (not generic advice)
- Supported by multiple photos in the timeline
- Interesting to a homeowner considering similar work

For each angle, provide:
- A compelling article title
- A one-sentence description of the angle/focus
- A key phrase from the captions that anchors this angle (for image selection)

Respond with ONLY valid JSON array:
[
  {
    "title": "article title here",
    "angle": "one sentence describing the focus",
    "assetHint": "key phrase from captions"
  }
]`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
    if (!text) return [];

    // Extract JSON from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const prompts = JSON.parse(jsonMatch[0]) as ArticlePrompt[];

    // Store on the project
    await sql`
      UPDATE projects
      SET metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ article_prompts: prompts, prompts_generated_at: new Date().toISOString() })}::jsonb
      WHERE id = ${projectId}
    `;

    return prompts;
  } catch (err) {
    console.error("Article prompt generation error:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Generate a blog article from a specific angle/prompt.
 * Selects assets relevant to the angle instead of evenly spaced.
 */
export async function generateProjectArticleFromPrompt(
  projectId: string,
  siteId: string,
  articlePrompt: ArticlePrompt
): Promise<ProjectBlogResult | null> {
  const [project] = await sql`
    SELECT id, name, slug, description, address, start_date, end_date, status
    FROM projects WHERE id = ${projectId}
  `;
  if (!project) return null;

  const snapshot = await buildProjectSnapshot(projectId);

  const [site] = await sql`
    SELECT s.name, s.brand_voice, s.content_vibe, s.url, s.blog_slug,
           bs.custom_domain
    FROM sites s
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE s.id = ${siteId}
  `;

  const allAssets = await sql`
    SELECT ma.id, ma.storage_url, ma.context_note, ma.date_taken, ma.created_at
    FROM media_assets ma
    JOIN asset_projects ap ON ap.asset_id = ma.id
    WHERE ap.project_id = ${projectId}
      AND ma.context_note IS NOT NULL AND ma.context_note != ''
      AND ma.triage_status = 'triaged'
    ORDER BY ma.sort_order ASC NULLS LAST
  `;

  if (allAssets.length < 3) return null;

  // Select assets relevant to this angle
  const selectedAssets = selectAssetsForAngle(
    allAssets as ProjectAsset[],
    articlePrompt.angle,
    articlePrompt.assetHint
  );

  const assetDescriptions = selectedAssets.map((a, i) => {
    const date = a.date_taken
      ? new Date(a.date_taken).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
      : null;
    return `{{IMAGE_${i + 1}}}${date ? ` [${date}]` : ""}: ${a.context_note}`;
  }).join("\n");

  const brandVoice = (site?.brand_voice || {}) as Record<string, unknown>;
  const contentVibe = (site?.content_vibe as string) || "";
  const projectUrl = buildProjectUrl(
    String(site?.blog_slug || ""),
    String(project.slug),
    site?.custom_domain ? String(site.custom_domain) : null
  );

  const genPrompt = `Write a blog article about a specific aspect of a real project.

## Article Focus
**Title**: ${articlePrompt.title}
**Angle**: ${articlePrompt.angle}

## Project
- **Name**: ${project.name}
- **Description**: ${project.description || "A renovation project"}
${snapshot.brands.length > 0 ? `- **Materials/Brands**: ${snapshot.brands.join(", ")}` : ""}

## Selected Photos
${assetDescriptions}

## Writing Guidelines
${contentVibe ? `Content vibe: ${contentVibe}` : ""}
${brandVoice.tone ? `Brand tone: ${brandVoice.tone}` : ""}
${snapshot.vocabulary.length > 0 ? `Domain vocabulary: ${snapshot.vocabulary.join(", ")}` : ""}

Write an article that:
1. Focuses specifically on "${articlePrompt.angle}"
2. Uses the selected photos as narrative anchors with {{IMAGE_N}} placeholders
3. Highlights craftsmanship, materials, and process
4. Includes specific details from the captions
5. Ends with a link: [View the complete ${project.name} project](${projectUrl})

Use the title "${articlePrompt.title}" as the first line (no # prefix).
600-1000 words. Markdown format. Include all image placeholders.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: genPrompt }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : null;
    if (!text) return null;

    const lines = text.split("\n");
    const title = lines[0].replace(/^#\s*/, "").trim();
    const body = lines.slice(1).join("\n").trim();

    const plainText = body.replace(/[#*\[\](){}]/g, "").replace(/\n+/g, " ").trim();
    const excerpt = plainText.slice(0, 200).replace(/\s\S*$/, "...");

    // Replace placeholders with real URLs
    let finalBody = body;
    const allowedUrls = new Set(selectedAssets.map((a) => a.storage_url));

    for (let i = 0; i < selectedAssets.length; i++) {
      const asset = selectedAssets[i];
      const alt = (asset.context_note || "").replace(/"/g, "'");
      const imageMarkdown = `\n\n![${alt}](${asset.storage_url})\n\n`;
      finalBody = finalBody.replace(new RegExp(`\\{?\\{?IMAGE_${i + 1}\\}?\\}?`, "g"), imageMarkdown);
    }

    // Strip hallucinated images
    finalBody = finalBody.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, _alt, url) => {
      if (allowedUrls.has(url)) return match;
      return "";
    });

    // Featured image: best match to the angle hint
    const hintWords = new Set(articlePrompt.assetHint.toLowerCase().match(/[a-z][a-z'-]+/g) || []);
    let bestFeaturedIdx = 0;
    let bestScore = 0;
    for (let i = 0; i < selectedAssets.length; i++) {
      const words = (selectedAssets[i].context_note || "").toLowerCase().match(/[a-z][a-z'-]+/g) || [];
      const score = words.filter((w) => hintWords.has(w)).length;
      if (score > bestScore) { bestScore = score; bestFeaturedIdx = i; }
    }

    return {
      title,
      body: finalBody,
      excerpt,
      assets: selectedAssets,
      featuredAssetId: selectedAssets[bestFeaturedIdx]?.id || selectedAssets[0]?.id,
    };
  } catch (err) {
    console.error("Project blog generation error:", err instanceof Error ? err.message : err);
    return null;
  }
}
