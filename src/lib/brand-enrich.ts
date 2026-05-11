import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { uploadBufferToR2 } from "@/lib/r2";
import { randomUUID } from "node:crypto";

/**
 * Brand enrichment for the audio-first auto-tagging pipeline (#201).
 *
 * Per seed_and_enrich_principle: human commits identity (name), AI
 * completes schema (URL, description, category). Multi-stage pipeline:
 *
 *   Stage 1: Claude knowledge lookup (URL + description + category)
 *   Stage 2: Web fetch + OG meta extract (real description, og:image URL)
 *   Stage 3: Logo download → R2 upload → media_asset → brand.hero_asset_id
 *   Stage 4 (future): Web search fallback for unknown brands
 *
 * Failure modes are non-fatal at every stage — the brand row exists
 * usable from the moment it's created. Each stage layers on top.
 */

const anthropic = new Anthropic();

// Impersonate Facebook's link-preview crawler. Brand sites are
// universally tuned to serve clean og:image meta to this UA because
// that's how their content surfaces in social previews. Big-brand
// WAFs (Cloudflare, Akamai, Imperva) explicitly whitelist this
// string while flagging generic "TracPostBot" UAs as scrapers.
// Same pattern Twitter / LinkedIn / Slack crawlers follow.
const OG_FETCH_UA =
  "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

interface EnrichResult {
  url: string | null;
  description: string | null;
  category: string | null;
  confidence: "high" | "medium" | "low";
}

interface OGMeta {
  title: string | null;
  description: string | null;
  image: string | null;
}

/**
 * Enrich a brand row through Stages 1, 2, 3.
 *
 * Default mode (force=false): idempotent — bails if `enriched_at` is set,
 * status is 'skipped', or url is already populated. The auto-on-creation
 * path uses this.
 *
 * Force mode (force=true): bypasses all bail-outs. Used by the operator
 * backfill route to sweep every brand regardless of state. Existing
 * user-set values (url, description, hero_asset_id) are preserved via
 * COALESCE — force never overwrites truth, only fills gaps.
 */
export async function enrichBrand(
  brandId: string,
  brandName: string,
  opts: { force?: boolean } = {},
): Promise<void> {
  const { force = false } = opts;

  const [current] = await sql`
    SELECT site_id, enrichment_status, enriched_at, url, hero_asset_id
    FROM brands WHERE id = ${brandId}
  `;
  if (!current) return;

  if (!force) {
    if (current.enriched_at) return;
    if (current.enrichment_status === "skipped") return;
    if (current.url) {
      // URL already set (manually) — skip enrichment, mark as such
      await sql`
        UPDATE brands SET enrichment_status = 'skipped', enriched_at = NOW()
        WHERE id = ${brandId}
      `;
      return;
    }
  }

  await sql`
    UPDATE brands SET enrichment_attempts = enrichment_attempts + 1
    WHERE id = ${brandId}
  `;

  const siteId = current.site_id as string;
  const existingUrl = (current.url as string | null) || null;
  const existingHeroId = (current.hero_asset_id as string | null) || null;

  try {
    // Stage 1: Claude knowledge lookup
    const claudeResult = await askClaudeAboutBrand(brandName);

    // Stage 2: Web fetch + OG extract.
    // Prefer the brand's existing user-set URL over Claude's URL — the
    // subscriber's URL is ground truth, Claude's is a guess.
    const fetchTarget = existingUrl || claudeResult.url;
    let ogMeta: OGMeta = { title: null, description: null, image: null };
    if (fetchTarget) {
      ogMeta = await fetchOGMeta(fetchTarget);
    }

    // Description preference: og:description (real, scraped) > Claude's summary
    const finalDescription = ogMeta.description || claudeResult.description;

    // Stage 3: Logo capture. Skip if a hero is already set on the brand
    // (force mode would otherwise create an orphan media_asset that
    // COALESCE drops on the way out — wasteful R2 write).
    //
    // Walk a prioritized candidate list. og:image is preferred when
    // available (often a hero-quality wordmark), then fall back to
    // conventional static-asset paths that bypass WAF/JS-render walls
    // because they're served straight from CDN. apple-touch-icon is a
    // de-facto logo standard at 180×180 and almost universal on big
    // brand sites that block bot HTML access.
    let heroAssetId: string | null = null;
    let heroSource: string | null = null;
    if (fetchTarget && !existingHeroId) {
      const candidates = buildLogoCandidates(fetchTarget, ogMeta.image);
      for (const candidate of candidates) {
        heroAssetId = await captureLogoAsHeroAsset(siteId, brandId, brandName, fetchTarget, candidate);
        if (heroAssetId) {
          heroSource = candidate;
          break;
        }
      }
    }

    // Status: "enriched" if any new useful data landed (claude url,
    // og description, or logo). "no_match" if nothing came back.
    const gotNewData = !!(claudeResult.url || ogMeta.description || heroAssetId);

    // Pattern C: when the captured logo came from Brandfetch's CDN,
    // remember the domain so renderers can construct variant URLs
    // (icon vs logo vs symbol, light vs dark, etc.) at runtime.
    const brandfetchDomain = extractBrandfetchDomain(heroSource);

    await sql`
      UPDATE brands
      SET
        url = COALESCE(brands.url, ${claudeResult.url}),
        description = COALESCE(brands.description, ${finalDescription}),
        hero_asset_id = COALESCE(brands.hero_asset_id, ${heroAssetId}),
        brandfetch_domain = COALESCE(brands.brandfetch_domain, ${brandfetchDomain}),
        enrichment_status = ${gotNewData ? "enriched" : "no_match"},
        enriched_at = NOW(),
        enrichment_metadata = ${JSON.stringify({
          category: claudeResult.category,
          confidence: claudeResult.confidence,
          enriched_at: new Date().toISOString(),
          provider: "claude-sonnet-4-6",
          fetch_target: fetchTarget,
          stage_2_og_extracted: !!(ogMeta.description || ogMeta.image),
          stage_3_logo_captured: !!heroAssetId,
          og_title: ogMeta.title,
          og_image_url: ogMeta.image,
          hero_source: heroSource,
          force,
        })}::jsonb
      WHERE id = ${brandId}
    `;
  } catch (err) {
    await sql`
      UPDATE brands
      SET
        enrichment_status = 'failed',
        enrichment_metadata = ${JSON.stringify({
          error: err instanceof Error ? err.message : String(err),
          attempted_at: new Date().toISOString(),
        })}::jsonb
      WHERE id = ${brandId}
    `;
    throw err;
  }
}

async function askClaudeAboutBrand(brandName: string): Promise<EnrichResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const prompt = `What can you tell me about the brand "${brandName}"? This is a real-world business or product brand likely used by a contractor, kitchen remodeler, or service business.

Return ONLY valid JSON in this exact shape:
{
  "url": "https://example.com",
  "description": "1-2 sentence factual description of the brand",
  "category": "kitchen_fixtures | appliances | cabinetry | lighting | flooring | plumbing | hardware | tile | stone | other",
  "confidence": "high" | "medium" | "low"
}

Rules:
- URL must be the brand's primary website (homepage). Use https.
- Description should be factual, no marketing language.
- Category should be the closest fit from the list above.
- confidence="high" if you're certain this is a real brand and the URL is correct.
- confidence="low" if you're guessing — return null url in this case.
- If you don't recognize the brand at all, return: {"url": null, "description": null, "category": "other", "confidence": "low"}`;

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  const cleaned = raw.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned) as EnrichResult;

  // Refuse low-confidence URL claims to avoid pollution
  if (parsed.confidence === "low") {
    parsed.url = null;
  }

  return parsed;
}

/**
 * Stage 2: fetch the URL, extract Open Graph meta tags via regex.
 * Per imperfection tolerance principle, regex is fine for the common
 * case. Edge cases (multi-line meta, unusual quoting) → falls back to
 * Claude's description.
 */
async function fetchOGMeta(url: string): Promise<OGMeta> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": OG_FETCH_UA,
        Accept: "text/html,application/xhtml+xml",
      },
      // Bound the network call — brand pages should respond fast
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { title: null, description: null, image: null };
    const html = await res.text();
    return {
      title: extractMeta(html, "og:title") || extractTitleTag(html),
      description:
        extractMeta(html, "og:description") ||
        extractMeta(html, "twitter:description") ||
        extractMeta(html, "description"),
      image: resolveUrl(extractImageMeta(html), url),
    };
  } catch {
    return { title: null, description: null, image: null };
  }
}

/**
 * Pull the domain segment out of a Brandfetch CDN URL so we can store
 * it on the brand row for runtime variant rendering. Returns null for
 * non-Brandfetch sources.
 */
export function extractBrandfetchDomain(heroSource: string | null): string | null {
  if (!heroSource || !heroSource.startsWith("https://cdn.brandfetch.io/")) return null;
  try {
    const path = new URL(heroSource).pathname.replace(/^\//, "");
    const domain = decodeURIComponent(path.split("/")[0]);
    return domain || null;
  } catch {
    return null;
  }
}

/**
 * Build the prioritized list of logo-candidate URLs for a brand site.
 *
 * Order:
 *   1. og:image (or fallback meta we already extracted) — usually the
 *      highest-quality option when available, often a wordmark.
 *   2. /apple-touch-icon.png — 180×180 by convention, almost always the
 *      brand's clean logo on a transparent or solid background.
 *      Served as a static asset, bypasses WAF gates that block
 *      dynamic HTML access.
 *   3. /apple-touch-icon-precomposed.png — older convention, same role.
 *   4. /favicon.ico — universal favicon, smallest quality.
 *   5. Google's s2/favicons service — bulletproof last resort. Free,
 *      no auth, Google-CDN-served (no WAF concerns), and indexed for
 *      basically every public domain. 128×128 PNG quality. Catches
 *      the enterprise-WAF tier (Thermador, Brizo, Makita, etc.) that
 *      blocks even our /favicon.ico requests.
 */
function buildLogoCandidates(brandUrl: string, ogImage: string | null): string[] {
  const candidates: string[] = [];
  const brandfetchClientId = process.env.BRANDFETCH_CLIENT_ID;

  try {
    const parsed = new URL(brandUrl);
    const apex = parsed.hostname.replace(/^www\./, "");

    // Brandfetch first: their CDN is the only source curated to return
    // an actual brand logo (vs og:image, which is often a hero shot or
    // product photo in disguise; vs favicons, which are tiny). Returns
    // 404 for unknown domains, so the chain falls through naturally.
    // Skipped silently in environments without the client ID.
    if (brandfetchClientId) {
      candidates.push(`https://cdn.brandfetch.io/${encodeURIComponent(apex)}?c=${encodeURIComponent(brandfetchClientId)}`);
    }

    // og:image as backup — sometimes a true wordmark, sometimes a hero
    if (ogImage) candidates.push(ogImage);

    // Try favicon paths from BOTH hostname variants (www and apex).
    // Some sites only serve favicons from one or the other.
    const hosts = parsed.hostname === apex ? [parsed.hostname] : [parsed.hostname, apex];
    for (const host of hosts) {
      const origin = `${parsed.protocol}//${host}`;
      candidates.push(`${origin}/apple-touch-icon.png`);
      candidates.push(`${origin}/apple-touch-icon-precomposed.png`);
      candidates.push(`${origin}/favicon.ico`);
    }

    // Google s2/favicons — bulletproof bottom-tier, always returns
    // something (even if a generic globe). Try apex first (broader
    // indexing), then www variant if different.
    candidates.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(apex)}&sz=128`);
    if (apex !== parsed.hostname) {
      candidates.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=128`);
    }
  } catch {
    // brandUrl invalid — fall through with whatever we have
    if (ogImage) candidates.push(ogImage);
  }
  return candidates;
}

/**
 * Try the standard image meta keys in order of preference. og:image
 * is canonical but many sites only emit alternatives (twitter:image,
 * og:image:url, og:image:secure_url, or even an itemprop="image"
 * legacy schema.org form).
 */
function extractImageMeta(html: string): string | null {
  return (
    extractMeta(html, "og:image") ||
    extractMeta(html, "og:image:url") ||
    extractMeta(html, "og:image:secure_url") ||
    extractMeta(html, "twitter:image") ||
    extractMeta(html, "twitter:image:src")
  );
}

function extractMeta(html: string, prop: string): string | null {
  // Try property attribute first (Open Graph), then name attribute (standard meta)
  const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]*\\b(?:property|name)=["']${escaped}["'][^>]*\\bcontent=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]*\\bcontent=["']([^"']+)["'][^>]*\\b(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) return decodeHTMLEntities(match[1].trim());
  }
  return null;
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? decodeHTMLEntities(match[1].trim()) : null;
}

function decodeHTMLEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'");
}

function resolveUrl(src: string | null, base: string): string | null {
  if (!src) return null;
  try {
    return new URL(src, base).toString();
  } catch {
    return null;
  }
}

/**
 * Stage 3: download og:image, upload to R2, create media_asset row,
 * return new asset id. Asset is created with archived_at set so it
 * stays out of the orchestrator pool — it's a reference asset for the
 * brand, not a publishable creative.
 */
/**
 * Public — used both by the automated enrichment pipeline and by the
 * subscriber-facing PATCH /api/brands/:id endpoint when a logo URL
 * is pasted manually.
 */
export async function captureLogoAsHeroAsset(
  siteId: string,
  brandId: string,
  brandName: string,
  brandUrl: string,
  imageUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: { "User-Agent": OG_FETCH_UA },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") || "image/png").split(";")[0].trim();
    // Reject non-image content types (some sites serve HTML on bad image URLs)
    if (!contentType.startsWith("image/")) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    // Cap at 5MB — logos are typically small; protects against runaway bytes
    if (buffer.length > 5 * 1024 * 1024) return null;

    const ext = contentType.split("/")[1].split("+")[0] || "png";
    const key = `brand-logos/${brandId}.${ext}`;
    const storageUrl = await uploadBufferToR2(key, buffer, contentType);

    const assetId = randomUUID();
    await sql`
      INSERT INTO media_assets (
        id, site_id, storage_url, media_type, source,
        triage_status, archived_at, context_note, metadata, created_at
      )
      VALUES (
        ${assetId},
        ${siteId},
        ${storageUrl},
        ${contentType},
        'brand_logo',
        'pending_briefing',
        NOW(),
        ${`Logo for ${brandName} (auto-fetched from ${brandUrl})`},
        ${JSON.stringify({
          brand_id: brandId,
          source_image_url: imageUrl,
          source_brand_url: brandUrl,
          fetched_at: new Date().toISOString(),
        })}::jsonb,
        NOW()
      )
    `;
    return assetId;
  } catch {
    return null;
  }
}
