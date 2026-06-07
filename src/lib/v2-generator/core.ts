import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import type {
  ContentSpec,
  GeneratedBody,
  ContentKit,
  GenerateResult,
} from "./types";
import { getBrandPlaybookFromDescriptor } from "@/lib/brand-identity/playbook-from-descriptor";
import { buildBodyPrompt, buildKitPrompt } from "./prompts";

const anthropic = new Anthropic();
const MODEL = "claude-haiku-4-5-20251001";

/**
 * Core v2 content generator.
 *
 * Two LLM calls:
 *   1. Body generation — title, body markdown w/ {{asset:UUID}} placeholders,
 *      excerpt, meta fields, content tags
 *   2. Kit generation — structured ingredients (hooks, takeaways, key terms,
 *      etc.) used by per-platform slicers
 *
 * Persistence:
 *   - One v2 row in the pool's table (blog_posts_v2 / projects_v2 / services_v2)
 *   - One assets-manifest row per asset used (hero + body + gallery)
 *   - content_kit JSONB on the v2 row
 *
 * Returns the v2 row id, slug, title, and asset count.
 */
export async function generateV2Content(spec: ContentSpec): Promise<GenerateResult> {
  // 1. Load site context.
  //
  // Phase B retirement (2026-06-07): brand_descriptor catalog is canonical
  // per [[brand-identity-layer-stack]]. Playbook is synthesized from the
  // catalog via getBrandPlaybookFromDescriptor. The observed signals.voice
  // fingerprint has no catalog equivalent today — Phase B gap per
  // [[brand-dna-retirement]]; voice is empty until catalog grows the
  // observed-voice-fingerprint substrate or pipeline.
  const [site] = await sql`
    SELECT name, url, identity_policy, identity_waiver_signed_at
    FROM businesses
    WHERE id = ${spec.siteId}
  `;
  if (!site) throw new Error(`Site ${spec.siteId} not found`);

  const siteName = String(site.name || "");
  const siteUrl = String(site.url || "");
  const playbook = await getBrandPlaybookFromDescriptor(spec.siteId);
  const brandVoice: Record<string, unknown> = {};

  // Resolve effective identity policy. 'allow_names' only applies when
  // the subscriber has signed the publisher waiver; otherwise we
  // fall back to 'anonymize' regardless of the stored policy (the
  // unsigned-waiver-on-permissive-policy → conservative fallback locked
  // 2026-05-19). The 6 dev sites flipped to 'allow_names' in migration
  // 131 but their waivers are NULL, so they currently resolve to
  // 'anonymize' until the subscriber visits the Privacy settings page.
  const identityPolicy: "allow_names" | "anonymize" =
    site.identity_policy === "allow_names" && site.identity_waiver_signed_at
      ? "allow_names"
      : "anonymize";

  // 2. Resolve available assets — pull the FULL context the database
  // knows, not a one-line hint. The model needs concrete details
  // (vendors, materials, scene type, personas) to write grounded
  // prose instead of generic AI filler.
  const assetIds = [spec.heroAssetId, ...(spec.bodyAssetIds || [])].filter(
    (id, i, arr) => arr.indexOf(id) === i,
  );
  const assetRows = await sql`
    SELECT id, media_type, context_note, content_pillar, content_pillars,
           content_tags, ai_analysis, transcription
    FROM media_assets
    WHERE id = ANY(${assetIds}::uuid[])
  `;
  const availableAssets = assetIds
    .map((id) => assetRows.find((r) => r.id === id))
    .filter((r): r is (typeof assetRows)[number] => Boolean(r))
    .map((r) => {
      const ai = (r.ai_analysis as Record<string, unknown> | null) || {};
      const mediaType = String(r.media_type || "image");
      return {
        id: r.id as string,
        kind: mediaType.startsWith("video") ? ("video" as const) : ("image" as const),
        mediaType,
        isHero: r.id === spec.heroAssetId,
        contextNote: (r.context_note as string | null) || null,
        // ai_analysis fields — coverage varies (image: 310/327 have
        // description, 174 have detected_vendors; video: 17/21 have
        // description, none have detected_vendors).
        description: (ai.description as string | null) || null,
        sceneType: (ai.scene_type as string | null) || null,
        detectedVendors: Array.isArray(ai.detected_vendors)
          ? (ai.detected_vendors as string[])
          : [],
        detectedPersonas: Array.isArray(ai.detected_personas)
          ? (ai.detected_personas as string[])
          : [],
        transcription: (r.transcription as string | null) || null,
        contentPillars: Array.isArray(r.content_pillars)
          ? (r.content_pillars as string[])
          : (r.content_pillar ? [r.content_pillar as string] : []),
        contentTags: Array.isArray(r.content_tags)
          ? (r.content_tags as string[])
          : [],
      };
    });

  // 3. LLM call 1 — body
  const bodyPrompt = buildBodyPrompt({
    spec,
    siteName,
    siteUrl,
    playbook,
    brandVoice,
    identityPolicy,
    availableAssets,
  });
  const bodyResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [{ role: "user", content: bodyPrompt }],
  });
  const bodyText =
    bodyResponse.content[0].type === "text" ? bodyResponse.content[0].text : "";
  const body = parseBody(bodyText);

  // 4. LLM call 2 — kit (uses body output as anchor context)
  const kitPrompt = buildKitPrompt({
    spec,
    siteName,
    siteUrl,
    playbook,
    brandVoice,
    identityPolicy,
    bodyContext: {
      title: body.title,
      body: body.body,
      excerpt: body.excerpt,
      contentTags: body.contentTags,
    },
  });
  const kitResponse = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: kitPrompt }],
  });
  const kitText =
    kitResponse.content[0].type === "text" ? kitResponse.content[0].text : "";
  const kit = parseKit(kitText);

  // 5. Persist (pool-specific row + manifest)
  const slug = generateSlug(body.title);
  const result = await persistV2(spec, body, kit, slug, availableAssets);

  return result;
}

/** Parse the body LLM JSON, with a permissive fallback. */
function parseBody(text: string): GeneratedBody {
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

/** Parse the kit LLM JSON, with a defaults-filled fallback. */
function parseKit(text: string): ContentKit {
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const fallback: ContentKit = {
    hooks: [],
    takeaways: [],
    keyTerms: [],
    proofPoints: [],
    inlineLinkContexts: ["Read more"],
    ctaVariants: { short: [], medium: [], long: [] },
    voiceMarkers: {
      signoffs: [],
      emojiPolicy: "sparse",
      exclamationDensity: "low",
      casing: "sentence",
    },
  };
  try {
    const parsed = JSON.parse(cleaned);
    return {
      hooks: arrStr(parsed.hooks),
      takeaways: arrStr(parsed.takeaways),
      keyTerms: arrStr(parsed.keyTerms),
      proofPoints: arrStr(parsed.proofPoints),
      inlineLinkContexts: arrStr(parsed.inlineLinkContexts).length
        ? arrStr(parsed.inlineLinkContexts)
        : fallback.inlineLinkContexts,
      ctaVariants: {
        short: arrStr(parsed.ctaVariants?.short),
        medium: arrStr(parsed.ctaVariants?.medium),
        long: arrStr(parsed.ctaVariants?.long),
      },
      voiceMarkers: {
        signoffs: arrStr(parsed.voiceMarkers?.signoffs),
        emojiPolicy: enumOf(parsed.voiceMarkers?.emojiPolicy, ["none", "sparse", "frequent"], "sparse"),
        exclamationDensity: enumOf(parsed.voiceMarkers?.exclamationDensity, ["low", "medium", "high"], "low"),
        casing: enumOf(parsed.voiceMarkers?.casing, ["sentence", "title", "lowercase"], "sentence"),
      },
    };
  } catch {
    return fallback;
  }
}

function arrStr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

function enumOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

/**
 * Persist a generated article into the appropriate v2 pool, plus
 * its asset manifest. Returns the GenerateResult shape.
 */
async function persistV2(
  spec: ContentSpec,
  body: GeneratedBody,
  kit: ContentKit,
  slug: string,
  availableAssets: Array<{ id: string }>,
): Promise<GenerateResult> {
  // Find which assets the LLM actually placed in the body, filtered to
  // the known-available set so LLM hallucinations (UUIDs that aren't in
  // media_assets) don't break the FK insert into the manifest table.
  const placeholderRegex = /\{\{asset:([0-9a-f-]{36})\}\}/g;
  const knownIds = new Set(availableAssets.map((a) => a.id));
  const placedIds = new Set<string>();
  let match;
  while ((match = placeholderRegex.exec(body.body)) !== null) {
    if (knownIds.has(match[1])) placedIds.add(match[1]);
  }
  // Hero is always slot 0; placed body assets follow; gallery is unused for now.
  placedIds.delete(spec.heroAssetId); // hero handled separately
  const orderedBodyIds = Array.from(placedIds);

  if (spec.pool === "blog") {
    const [row] = await sql`
      INSERT INTO blog_posts_v2 (
        business_id, slug, title, body, excerpt,
        hero_asset_id, poster_asset_id, seed_asset_id, service_id,
        meta_title, meta_description,
        content_pillars, content_tags,
        status, published_at,
        content_kit
      ) VALUES (
        ${spec.siteId}, ${slug}, ${body.title}, ${body.body}, ${body.excerpt},
        ${spec.heroAssetId}, ${spec.posterAssetId || null}, ${spec.seedAssetId || null}, ${spec.serviceId || null},
        ${body.metaTitle}, ${body.metaDescription},
        ${body.contentPillars.length ? body.contentPillars : spec.contentPillars || []}::text[],
        ${body.contentTags.length ? body.contentTags : spec.contentTags || []}::text[],
        ${spec.status || "draft"}, ${spec.status === "published" ? "NOW()" : null},
        ${JSON.stringify(kit)}::jsonb
      )
      RETURNING id, slug, title
    `;
    await insertManifest("blog_post_assets", "blog_post_id", row.id as string, spec.heroAssetId, orderedBodyIds);
    return {
      pool: "blog",
      id: row.id as string,
      slug: row.slug as string,
      title: row.title as string,
      assetsCount: 1 + orderedBodyIds.length,
    };
  }

  if (spec.pool === "project") {
    const [row] = await sql`
      INSERT INTO projects_v2 (
        business_id, slug, name, description,
        hero_asset_id, poster_asset_id,
        content_pillars, content_tags,
        status, start_date, end_date,
        content_kit
      ) VALUES (
        ${spec.siteId}, ${slug}, ${body.title}, ${body.excerpt},
        ${spec.heroAssetId}, ${spec.posterAssetId || null},
        ${body.contentPillars.length ? body.contentPillars : spec.contentPillars || []}::text[],
        ${body.contentTags.length ? body.contentTags : spec.contentTags || []}::text[],
        ${spec.status || "active"}, ${spec.projectMeta?.startDate || null}, ${spec.projectMeta?.endDate || null},
        ${JSON.stringify(kit)}::jsonb
      )
      RETURNING id, slug, name AS title
    `;
    // For projects, the body's markdown becomes a long-form description
    // appended to row.metadata for now (or we could add a body column to projects_v2).
    // The asset manifest still uses placeholder placement.
    await insertManifest("project_assets", "project_id", row.id as string, spec.heroAssetId, orderedBodyIds);
    return {
      pool: "project",
      id: row.id as string,
      slug: row.slug as string,
      title: row.title as string,
      assetsCount: 1 + orderedBodyIds.length,
    };
  }

  if (spec.pool === "service") {
    const [row] = await sql`
      INSERT INTO services_v2 (
        business_id, slug, name, description, body, excerpt,
        hero_asset_id, poster_asset_id,
        price_range, duration, display_order,
        content_pillars, content_tags,
        meta_title, meta_description,
        status,
        content_kit
      ) VALUES (
        ${spec.siteId}, ${slug}, ${body.title}, ${body.excerpt}, ${body.body}, ${body.excerpt},
        ${spec.heroAssetId}, ${spec.posterAssetId || null},
        ${spec.serviceMeta?.priceRange || null}, ${spec.serviceMeta?.duration || null}, ${spec.serviceMeta?.displayOrder || 0},
        ${body.contentPillars.length ? body.contentPillars : spec.contentPillars || []}::text[],
        ${body.contentTags.length ? body.contentTags : spec.contentTags || []}::text[],
        ${body.metaTitle}, ${body.metaDescription},
        ${spec.status || "active"},
        ${JSON.stringify(kit)}::jsonb
      )
      RETURNING id, slug, name AS title
    `;
    await insertManifest("service_assets", "service_id", row.id as string, spec.heroAssetId, orderedBodyIds);
    return {
      pool: "service",
      id: row.id as string,
      slug: row.slug as string,
      title: row.title as string,
      assetsCount: 1 + orderedBodyIds.length,
    };
  }

  throw new Error(`Unknown pool: ${spec.pool}`);
}

/** Insert hero (slot 0) + body assets (slots 1..N) into a manifest table. */
async function insertManifest(
  table: "blog_post_assets" | "project_assets" | "service_assets",
  fkColumn: "blog_post_id" | "project_id" | "service_id",
  parentId: string,
  heroAssetId: string,
  bodyAssetIds: string[],
): Promise<void> {
  // Hero
  if (table === "blog_post_assets") {
    await sql`INSERT INTO blog_post_assets (blog_post_id, media_asset_id, slot_index, role) VALUES (${parentId}, ${heroAssetId}, 0, 'hero')`;
  } else if (table === "project_assets") {
    await sql`INSERT INTO project_assets (project_id, media_asset_id, slot_index, role) VALUES (${parentId}, ${heroAssetId}, 0, 'hero')`;
  } else {
    await sql`INSERT INTO service_assets (service_id, media_asset_id, slot_index, role) VALUES (${parentId}, ${heroAssetId}, 0, 'hero')`;
  }
  // Body assets
  let slot = 1;
  for (const id of bodyAssetIds) {
    if (table === "blog_post_assets") {
      await sql`INSERT INTO blog_post_assets (blog_post_id, media_asset_id, slot_index, role) VALUES (${parentId}, ${id}, ${slot}, 'body')`;
    } else if (table === "project_assets") {
      await sql`INSERT INTO project_assets (project_id, media_asset_id, slot_index, role) VALUES (${parentId}, ${id}, ${slot}, 'body')`;
    } else {
      await sql`INSERT INTO service_assets (service_id, media_asset_id, slot_index, role) VALUES (${parentId}, ${id}, ${slot}, 'body')`;
    }
    slot++;
  }
  // fkColumn is referenced for type safety / future-proofing; the
  // explicit branches above use the literal column names.
  void fkColumn;
}

/**
 * Slug generator — lowercase, ASCII-safe, with a short uniqueness suffix.
 */
function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  // Random 4-char suffix to keep collisions rare without an extra DB roundtrip
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base}-${suffix}`;
}
