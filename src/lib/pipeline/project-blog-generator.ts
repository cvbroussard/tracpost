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

const anthropic = new Anthropic();

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

  // Fetch site for brand voice
  const [site] = await sql`
    SELECT name, brand_voice, content_vibe, url FROM sites WHERE id = ${siteId}
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
    ORDER BY COALESCE(ma.date_taken, ma.created_at) ASC
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
  const projectUrl = `/projects/${project.slug}`;

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
