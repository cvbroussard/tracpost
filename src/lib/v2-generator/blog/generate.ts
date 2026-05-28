import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import {
  fixMalformedMarkdown,
  scanContent,
  buildArticleSchema,
  generateContentKit,
} from "../shared";
import { assembleBlogPrompt } from "./assemble";
import type { BlogGenerateSpec, BlogGeneratedBody, BlogGenerateResult } from "./types";

const anthropic = new Anthropic();

/**
 * Generate a v2 blog article.
 *
 * Pipeline:
 *   1. Load site context (brand_dna)
 *   2. Resolve seed + body assets with full rich metadata
 *   3. Pull hook + existing titles + vendor links + Wikipedia research (parallel)
 *   4. Classify content type (or use override)
 *   5. Build prompt with type-specific structure + two-zone rule
 *   6. LLM call (Sonnet 4.6 with playbook, Haiku fallback)
 *   7. Parse + repair body markdown
 *   8. Filter placeholders to known asset ids
 *   9. Content guard scan
 *   10. Persist to blog_posts_v2 + manifest + schema_jsonld in metadata
 *
 * NOTE: this generator only produces the article body and persists.
 * The content_kit (per-platform slicer ingredients) is generated in a
 * separate second LLM call, currently still in the v2 core engine.
 * After all three pool generators land, the content_kit step will be
 * extracted into shared/content-kit-generator.ts and called from each
 * pool generator after persistence.
 */
export async function generateBlogArticle(spec: BlogGenerateSpec): Promise<BlogGenerateResult> {
  // 1-5: assemble the prompt + all context (no LLM call)
  const assembled = await assembleBlogPrompt(spec);
  const { prompt, contentType, effectiveModel, effectiveMaxTokens, inputs } = assembled;
  const { siteName, siteUrl, assets } = inputs;

  // 6. LLM call — Sonnet when playbook present, Haiku fallback
  const response = await anthropic.messages.create({
    model: effectiveModel,
    max_tokens: effectiveMaxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const body = parseBlogBody(text);

  // 7. Repair body markdown (placeholders preserved; only fix malformed syntax)
  body.body = fixMalformedMarkdown(body.body);

  // 8. Filter placeholders to known asset ids — drop any LLM-hallucinated UUIDs
  const knownIds = new Set(assets.map((a) => a.id));
  const placeholderRegex = /\{\{asset:([0-9a-f-]{36})\}\}/g;
  const placedIds = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = placeholderRegex.exec(body.body)) !== null) {
    if (knownIds.has(m[1])) placedIds.add(m[1]);
  }
  // Strip placeholders for unknown ids from body (cleanup)
  body.body = body.body.replace(placeholderRegex, (full, id) =>
    knownIds.has(id) ? full : "",
  );

  // Hero is always slot 0; body assets follow in placement order
  placedIds.delete(spec.heroAssetId);
  const orderedBodyIds = Array.from(placedIds);

  // 9. Content guard scan
  const guard = await scanContent(body.title, body.body, siteName);
  const status = guard.pass ? (spec.status || "draft") : "flagged";

  // 10. Persist
  const slug = generateSlug(body.title);
  const heroUrl = await getAssetStorageUrl(spec.heroAssetId);
  const schemaJsonld = buildArticleSchema({
    title: body.title,
    body: body.body,
    excerpt: body.excerpt,
    metaDescription: body.metaDescription,
    heroUrl,
    siteName,
    siteUrl,
  });
  const metadata: Record<string, unknown> = {
    content_type: contentType,
    schema_jsonld: schemaJsonld,
  };
  if (!guard.pass && guard.flags.length > 0) {
    metadata.guard_flags = guard.flags;
  }

  const [row] = await sql`
    INSERT INTO blog_posts_v2 (
      business_id, slug, title, body, excerpt,
      hero_asset_id, poster_asset_id, seed_asset_id, service_id, project_id,
      meta_title, meta_description,
      content_pillars, content_tags,
      status, published_at,
      metadata
    ) VALUES (
      ${spec.siteId}, ${slug}, ${body.title}, ${body.body}, ${body.excerpt},
      ${spec.heroAssetId}, ${spec.posterAssetId || null}, ${spec.seedAssetId || null},
      ${spec.serviceId || null}, ${spec.projectId || null},
      ${body.metaTitle}, ${body.metaDescription},
      ${body.contentPillars.length ? body.contentPillars : []}::text[],
      ${body.contentTags.length ? body.contentTags : []}::text[],
      ${status}, ${status === "published" ? new Date().toISOString() : null},
      ${JSON.stringify(metadata)}::jsonb
    )
    RETURNING id, slug, title
  `;

  // Manifest
  await sql`INSERT INTO blog_post_assets (blog_post_id, media_asset_id, slot_index, role) VALUES (${row.id}, ${spec.heroAssetId}, 0, 'hero')`;
  let slot = 1;
  for (const id of orderedBodyIds) {
    await sql`INSERT INTO blog_post_assets (blog_post_id, media_asset_id, slot_index, role) VALUES (${row.id}, ${id}, ${slot}, 'body')`;
    slot++;
  }

  // Content kit — second LLM call (Haiku) to extract per-platform
  // slicer ingredients. Persists onto the v2 row's content_kit JSONB.
  // Non-fatal — article exists even if kit generation fails.
  try {
    const kit = await generateContentKit({
      siteId: spec.siteId,
      title: body.title,
      body: body.body,
      excerpt: body.excerpt,
      contentTags: body.contentTags,
    });
    await sql`UPDATE blog_posts_v2 SET content_kit = ${JSON.stringify(kit)}::jsonb WHERE id = ${row.id}`;
  } catch (err) {
    console.error(`Content kit generation failed for ${row.id}:`, err instanceof Error ? err.message : err);
    // Article remains usable; Compose falls back to title-as-caption when kit is empty.
  }

  return {
    id: row.id as string,
    slug: row.slug as string,
    title: row.title as string,
    contentType,
    assetsCount: 1 + orderedBodyIds.length,
    status,
  };
}

/** Parse the body LLM JSON, with a permissive fallback. */
function parseBlogBody(text: string): BlogGeneratedBody {
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    return {
      title: String(parsed.title || "Untitled"),
      body: String(parsed.body || ""),
      excerpt: String(parsed.excerpt || ""),
      metaTitle: String(parsed.metaTitle || parsed.title || ""),
      metaDescription: String(parsed.metaDescription || parsed.excerpt || ""),
      contentPillars: Array.isArray(parsed.contentPillars) ? parsed.contentPillars.map(String) : [],
      contentTags: Array.isArray(parsed.contentTags) ? parsed.contentTags.map(String) : [],
    };
  } catch {
    // Fallback — salvage what we can
    const titleMatch = cleaned.match(/"title"\s*:\s*"([^"]+)"/);
    const bodyMatch = cleaned.match(/"body"\s*:\s*"([\s\S]+?)"\s*,\s*"excerpt"/);
    if (bodyMatch) {
      const body = bodyMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      return {
        title: titleMatch ? titleMatch[1] : "Untitled",
        body,
        excerpt: body.slice(0, 200),
        metaTitle: titleMatch ? titleMatch[1] : "",
        metaDescription: body.slice(0, 155),
        contentPillars: [],
        contentTags: [],
      };
    }
    return {
      title: "Untitled",
      body: cleaned,
      excerpt: cleaned.slice(0, 200),
      metaTitle: "",
      metaDescription: "",
      contentPillars: [],
      contentTags: [],
    };
  }
}

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}

async function getAssetStorageUrl(assetId: string): Promise<string | null> {
  const [r] = await sql`SELECT storage_url FROM media_assets WHERE id = ${assetId}`;
  return (r?.storage_url as string | null) || null;
}
