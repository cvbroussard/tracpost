/**
 * Research enrichment for blog content.
 * AI-powered entity extraction + Wikipedia/Wikimedia lookups.
 */

import Anthropic from "@anthropic-ai/sdk";
import { generateEditorialImage } from "@/lib/image-gen/gemini";
import { uploadBufferToR2 } from "@/lib/r2";
import { sql } from "@/lib/db";
import { seoFilename } from "@/lib/seo-filename";

const anthropic = new Anthropic();

export interface EditorialImageMeta {
  url: string;
  prompt: string;
  alt: string;
  entities: string[];
}

export interface ResearchResult {
  text: string;
  editorialImages: EditorialImageMeta[];
}

interface WikiSummary {
  title: string;
  extract: string;
  description?: string;
  thumbnail?: string;
  images: Array<{ url: string; description: string }>;
}

interface ExtractedEntities {
  brands: string[];
  materials: string[];
  techniques: string[];
  products: string[];
}

/**
 * AI-powered entity extraction from a context note.
 * Industry-agnostic — works for construction, food, beauty, fitness, etc.
 * Uses Claude Haiku for speed and cost.
 */
export async function extractResearchTerms(contextNote: string): Promise<string[]> {
  if (!contextNote || contextNote.length < 10) return [];

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: `Extract named entities from this content note that would benefit from research. Return ONLY valid JSON, no markdown.

Content note: "${contextNote}"

Extract named entities. Use the PROPER NAME as it would appear on Wikipedia:
- brands: Company/manufacturer proper names (e.g., "Sub-Zero", "Thermador", "Wolf")
- materials: Material proper names (e.g., "zellige", "black walnut", "Calacatta marble")
- techniques: Technique proper names (e.g., "inset cabinetry", "sous vide")
- products: Product line proper names (e.g., "Brizo Litze", "Viking Professional")

Use the entity's actual name — NOT with generic suffixes like "tile", "wood", "appliance", "refrigeration".
For example: "zellige" not "zellige tile". "black walnut" not "black walnut wood". "Sub-Zero" not "Sub-Zero refrigeration".

Only include terms that are specific and researchable on Wikipedia. Skip generic words and small/local vendors.
If nothing specific is found, return empty arrays.

{"brands":[],"materials":[],"techniques":[],"products":[]}`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const entities: ExtractedEntities = JSON.parse(cleaned);

    // Flatten all entities into unique research terms, max 5
    const all = [
      ...entities.brands,
      ...entities.products,
      ...entities.materials,
      ...entities.techniques,
    ];
    return [...new Set(all)].slice(0, 5);
  } catch (err) {
    console.warn("Entity extraction failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Search Wikipedia for a term and return a brief summary + images.
 */
export async function lookupWikipedia(term: string): Promise<WikiSummary | null> {
  try {
    // Direct page summary lookup
    const searchRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(term)}`,
      { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "TracPost/1.0 (blog research)" } }
    );

    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.type === "standard" && data.extract) {
        const images = await fetchWikiImages(data.title);
        return {
          title: data.title,
          extract: data.extract.slice(0, 500),
          description: data.description,
          thumbnail: data.thumbnail?.source,
          images,
        };
      }
    }

    // Fallback: search API
    const fallbackRes = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&format=json&srlimit=1`,
      { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "TracPost/1.0 (blog research)" } }
    );

    if (!fallbackRes.ok) return null;

    const fallbackData = await fallbackRes.json();
    const firstResult = fallbackData?.query?.search?.[0];
    if (!firstResult) return null;

    const summaryRes = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(firstResult.title)}`,
      { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "TracPost/1.0 (blog research)" } }
    );

    if (!summaryRes.ok) return null;

    const summaryData = await summaryRes.json();
    if (summaryData.type === "standard" && summaryData.extract) {
      const images = await fetchWikiImages(summaryData.title);
      return {
        title: summaryData.title,
        extract: summaryData.extract.slice(0, 500),
        description: summaryData.description,
        thumbnail: summaryData.thumbnail?.source,
        images,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch images from a Wikipedia article via the MediaWiki API.
 * Returns public domain / CC-licensed images from the article.
 */
async function fetchWikiImages(title: string): Promise<Array<{ url: string; description: string }>> {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=images&format=json&imlimit=10`,
      { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "TracPost/1.0 (blog research)" } }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const pages = data.query?.pages || {};
    const page = Object.values(pages)[0] as Record<string, unknown>;
    const imageList = (page?.images || []) as Array<{ title: string }>;

    // Filter out icons, logos, fractals, and non-content images
    const contentImages = imageList.filter((img) => {
      const name = img.title.toLowerCase();
      return !name.includes("icon") && !name.includes("logo") && !name.includes("flag")
        && !name.includes("symbol") && !name.includes("commons-logo")
        && !name.includes("fractal") && !name.includes("fibonacci")
        && !name.includes("diagram") && !name.includes("graph")
        && (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png"));
    }).slice(0, 3);

    return resolveImageUrls(contentImages);
  } catch {
    return [];
  }
}

/**
 * Resolve File: titles to actual URLs with metadata.
 */
async function resolveImageUrls(
  images: Array<{ title: string }>
): Promise<Array<{ url: string; description: string }>> {
  const results: Array<{ url: string; description: string }> = [];

  for (const img of images) {
    try {
      const infoRes = await fetch(
        `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(img.title)}&prop=imageinfo&iiprop=url|size|extmetadata&format=json`,
        { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "TracPost/1.0 (blog research)" } }
      );

      if (!infoRes.ok) continue;

      const infoData = await infoRes.json();
      const infoPages = infoData.query?.pages || {};
      const infoPage = Object.values(infoPages)[0] as Record<string, unknown>;
      const imageInfo = (infoPage?.imageinfo as Array<Record<string, unknown>>)?.[0];

      if (!imageInfo?.url) continue;

      // Quality filter: skip images smaller than 400px wide
      const width = (imageInfo.width as number) || 0;
      if (width > 0 && width < 400) continue;

      const extMeta = imageInfo.extmetadata as Record<string, { value: string }> | undefined;
      const desc = extMeta?.ImageDescription?.value?.replace(/<[^>]+>/g, "").slice(0, 100)
        || img.title.replace("File:", "").replace(/\.[^.]+$/, "").replace(/_/g, " ");

      results.push({
        url: imageInfo.url as string,
        description: desc,
      });
    } catch {
      continue;
    }
  }

  return results;
}

/**
 * Search Wikimedia Commons directly for targeted visual content.
 * More intentional than grabbing whatever's on the Wikipedia article page.
 */
async function searchCommonsImages(
  query: string,
  limit = 3
): Promise<Array<{ url: string; description: string }>> {
  try {
    const res = await fetch(
      `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srnamespace=6&format=json&srlimit=${limit}&origin=*`,
      { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "TracPost/1.0 (blog research)" } }
    );

    if (!res.ok) return [];

    const data = await res.json();
    const searchResults = (data.query?.search || []) as Array<{ title: string }>;

    if (searchResults.length === 0) return [];

    // Filter to photos only — no PDFs, SVGs, icons, logos, maps, vehicles, people
    const photoResults = searchResults.filter((r) => {
      const name = r.title.toLowerCase();
      return (name.endsWith(".jpg") || name.endsWith(".jpeg") || name.endsWith(".png"))
        && !name.includes("icon") && !name.includes("logo") && !name.includes("flag")
        && !name.includes("coat_of_arms") && !name.includes("map")
        && !name.includes("diagram") && !name.includes("chart")
        && !name.includes("table") && !name.includes("graph")
        && !name.includes("lambretta") && !name.includes("vespa")
        && !name.includes("automobile") && !name.includes("motorcycle");
    });

    // Resolve URLs using Commons API (not Wikipedia)
    const results: Array<{ url: string; description: string }> = [];

    for (const img of photoResults.slice(0, limit)) {
      try {
        const infoRes = await fetch(
          `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(img.title)}&prop=imageinfo&iiprop=url|size|extmetadata&format=json&origin=*`,
          { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "TracPost/1.0 (blog research)" } }
        );

        if (!infoRes.ok) continue;

        const infoData = await infoRes.json();
        const infoPages = infoData.query?.pages || {};
        const infoPage = Object.values(infoPages)[0] as Record<string, unknown>;
        const imageInfo = (infoPage?.imageinfo as Array<Record<string, unknown>>)?.[0];

        if (!imageInfo?.url) continue;

        const width = (imageInfo.width as number) || 0;
        if (width > 0 && width < 400) continue;

        const extMeta = imageInfo.extmetadata as Record<string, { value: string }> | undefined;
        const desc = extMeta?.ImageDescription?.value?.replace(/<[^>]+>/g, "").slice(0, 120)
          || img.title.replace("File:", "").replace(/\.[^.]+$/, "").replace(/_/g, " ");

        results.push({
          url: imageInfo.url as string,
          description: desc,
        });
      } catch {
        continue;
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * AI-powered editorial image prompt generation.
 * Given extracted entities and context, generates prompts for AI image generation
 * that complement the subscriber's own photos.
 */
async function generateImagePrompts(
  entities: ExtractedEntities,
  contextNote: string,
  corrections: Array<{ entity_key: string; correction: string }> = [],
  baseStyle: string = "",
  variations: string[] = []
): Promise<Array<{ prompt: string; alt: string }>> {
  const allEntities = [
    ...entities.materials,
    ...entities.brands,
    ...entities.techniques,
    ...entities.products,
  ];

  if (allEntities.length === 0) return [];

  // Use site variations if available, otherwise fall back to defaults
  const variationList = variations.length > 0
    ? variations
    : [
        "Wide environmental shot — full context, architectural framing",
        "Tight detail close-up — material texture, grain, surface quality",
        "Process and craftsmanship — hands working with tools, mid-fabrication",
        "Single object vignette — one piece isolated, clean background",
        "Lifestyle context — the material in a styled, lived-in setting",
        "Raw material origin — the material before fabrication, natural state",
      ];

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [{
        role: "user",
        content: `Generate 2-3 editorial photograph prompts for AI image generation.

Context note (how these materials/vendors are being used):
"${contextNote}"

Entities: ${allEntities.join(", ")}

Generate prompts for images that show the CRAFT and ORIGIN behind these materials.
${baseStyle ? `\n## Photography Style (apply to ALL images)\n${baseStyle}` : ""}

Each image MUST use a DIFFERENT composition from this list (pick 2-3, do NOT repeat):
${variationList.map((v, i) => `${i + 1}. ${v}`).join("\n")}

Do NOT repeat the same framing across prompts.
${corrections.length > 0
  ? `\nIMPORTANT — Apply these subscriber corrections for accuracy:\n${corrections.map((c) => `- ${c.entity_key}: "${c.correction}"`).join("\n")}`
  : ""}

Return ONLY JSON array, no markdown:
[{"prompt": "...", "alt": "Short alt text"}]`,
      }],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    const prompts = JSON.parse(cleaned);
    return Array.isArray(prompts) ? prompts.slice(0, 3) : [];
  } catch {
    return [];
  }
}

/**
 * Check if a Wikipedia result is relevant to the original search context.
 * Filters out pop culture, fictional characters, and other irrelevant matches.
 */
function isRelevantResult(summary: WikiSummary, searchTerm: string, contextNote: string): boolean {
  const desc = (summary.description || "").toLowerCase();
  const extract = summary.extract.toLowerCase();

  // Reject fictional characters, entertainment, electronics, software, and other irrelevant domains
  const irrelevantPatterns = [
    /fictional character/i, /video game/i, /television/i, /tv series/i,
    /\bactor\b/i, /\bactress\b/i, /\bsinger\b/i, /\bmusician\b/i,
    /\bathlete\b/i, /\bfilm\b/i, /\bmovie\b/i, /\bband\b/i,
    /\bnovel\b/i, /\bcomic\b/i, /\banime\b/i, /\bmanga\b/i,
    /mortal kombat/i, /disney/i, /marvel/i, /dc comics/i,
    /\bpolitician\b/i, /\bfootball\b/i, /\bbaseball\b/i, /\bsoccer\b/i,
    /\bsoftware\b/i, /\bcomputer\b/i, /\bsimulator\b/i, /\belectronic circuit\b/i,
    /\bprogramming\b/i, /\bsemiconductor\b/i, /\balgorithm\b/i,
    /\bcity in\b/i, /\btown in\b/i, /\bvillage in\b/i, /\bmunicipality\b/i,
    /\bstate of\b/i, /\bprovince\b/i, /\bcounty in\b/i, /\bdistrict\b/i,
  ];

  const combined = desc + " " + extract;
  for (const pattern of irrelevantPatterns) {
    if (pattern.test(combined)) return false;
  }

  return true;
}

/**
 * Research all entities from a context note and return combined background.
 * Includes text summaries and targeted visual references.
 *
 * Two image sources:
 * 1. Wikipedia article images (incidental — whatever's on the page)
 * 2. Wikimedia Commons search (intentional — targeted visual queries)
 */
export async function researchContextNote(
  contextNote: string,
  excludeImageUrls: string[] = [],
  siteId?: string,
  sourceVendorIds?: string[]
): Promise<ResearchResult> {
  const empty: ResearchResult = { text: "", editorialImages: [] };
  if (!contextNote) return empty;

  const terms = await extractResearchTerms(contextNote);
  if (terms.length === 0) return empty;

  // Re-extract structured entities for image query generation
  let entities: ExtractedEntities = { brands: [], materials: [], techniques: [], products: [] };
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: `Extract named entities from this content note. Return ONLY valid JSON, no markdown.

Content note: "${contextNote}"

{"brands":[],"materials":[],"techniques":[],"products":[]}`,
      }],
    });
    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
    entities = JSON.parse(cleaned);
  } catch { /* use empty entities */ }

  const results: string[] = [];

  // 1. Wikipedia text research + article images
  for (const term of terms) {
    let summary = await lookupWikipedia(term);

    if (summary && !isRelevantResult(summary, term, contextNote)) {
      const categoryHints = ["material", "manufacturer", "appliance", "tile", "woodworking"];
      let found = false;
      for (const hint of categoryHints) {
        if (contextNote.toLowerCase().includes(hint) || term.toLowerCase().includes(hint)) {
          summary = await lookupWikipedia(`${term} ${hint}`);
          if (summary && isRelevantResult(summary, term, contextNote)) {
            found = true;
            break;
          }
        }
      }
      if (!found) summary = null;
    }

    if (summary) {
      // Text research only — images come from targeted Commons search below
      results.push(`**${summary.title}**: ${summary.extract}`);
    }
  }

  // 2. AI-generated editorial images (Gemini / Nano Banana)
  const editorialImagesMeta: EditorialImageMeta[] = [];

  if (siteId) {
    // Fetch site image style + corrections
    const [siteStyle] = await sql`
      SELECT image_style, image_variations FROM sites WHERE id = ${siteId}
    `;
    const baseStyle = (siteStyle?.image_style as string) || "";
    const variations = (siteStyle?.image_variations || []) as string[];

    const allEntityKeys = [
      ...entities.brands, ...entities.materials,
      ...entities.techniques, ...entities.products,
    ].map((e) => e.toLowerCase());

    let corrections: Array<{ entity_key: string; correction: string }> = [];
    if (allEntityKeys.length > 0) {
      corrections = await sql`
        SELECT entity_key, correction FROM image_corrections
        WHERE site_id = ${siteId} AND entity_key = ANY(${allEntityKeys})
      ` as Array<{ entity_key: string; correction: string }>;
    }

    const imagePrompts = await generateImagePrompts(entities, contextNote, corrections, baseStyle, variations);
    if (imagePrompts.length > 0) {
      for (const imgPrompt of imagePrompts.slice(0, 3)) {
        try {
          const image = await generateEditorialImage(imgPrompt.prompt);
          if (image) {
            const ext = image.mimeType.includes("png") ? "png" : "jpg";
            const fname = seoFilename(imgPrompt.alt, ext);
            const key = `sites/${siteId}/media/${fname}`;
            const url = await uploadBufferToR2(key, image.data, image.mimeType);

            const meta: EditorialImageMeta = {
              url,
              prompt: imgPrompt.prompt,
              alt: imgPrompt.alt,
              entities: allEntityKeys.slice(0, 5),
            };
            editorialImagesMeta.push(meta);

            // Register as media asset so it enters the reservoir
            try {
              const [newAsset] = await sql`
                INSERT INTO media_assets (
                  site_id, storage_url, media_type, context_note,
                  source, triage_status, quality_score,
                  content_tags, metadata
                ) VALUES (
                  ${siteId}, ${url}, 'image', ${imgPrompt.alt},
                  'ai_generated', 'triaged', 0.95,
                  ${allEntityKeys.slice(0, 5)},
                  ${JSON.stringify({
                    ai_generated: true,
                    generation_prompt: imgPrompt.prompt,
                    source_entities: allEntityKeys.slice(0, 5),
                  })}::jsonb
                )
                RETURNING id
              `;
              // Inherit vendor associations from the source asset
              if (newAsset && sourceVendorIds && sourceVendorIds.length > 0) {
                for (const vendorId of sourceVendorIds) {
                  await sql`
                    INSERT INTO asset_vendors (asset_id, vendor_id)
                    VALUES (${newAsset.id}, ${vendorId})
                    ON CONFLICT DO NOTHING
                  `;
                }
              }
            } catch {
              // Non-blocking — image is still used in the article
            }
          }
        } catch (err) {
          console.warn("Editorial image gen failed:", err instanceof Error ? err.message : err);
        }
      }

      if (editorialImagesMeta.length > 0) {
        let entry = "## Editorial Images (AI-generated, embed these in the article)";
        entry += "\nThese are editorial images that complement the subscriber's own photos:";
        for (const img of editorialImagesMeta) {
          entry += `\n- ![${img.alt}](${img.url})`;
        }
        results.push(entry);
      }
    }
  }

  if (results.length === 0) return empty;

  return {
    text: results.join("\n\n"),
    editorialImages: editorialImagesMeta,
  };
}
