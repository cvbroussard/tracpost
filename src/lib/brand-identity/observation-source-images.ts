/**
 * Observation-source image assembly + inline-base64 fetch helpers.
 *
 * Shared between aesthetic Phase 2 observation, env_look generator, and
 * subject_style generator. All three need the same image corpus per brand:
 *   - business_website_screenshot
 *   - business_logo
 *   - gbp_cover_asset (via media_assets join)
 *   - gbp_logo_asset (via media_assets join)
 *   - priority-category gbp_photo_sync entries
 *
 * Why inline base64 (not URL pass-through): Anthropic's URL-fetch path is
 * WAF-blocked by assets.tracpost.com on every R2 asset. We fetch ourselves
 * and pass inline. Same tradeoff (~33% payload bloat) accepted across all
 * three pipelines.
 */
import "server-only";
import { sql } from "@/lib/db";

const PRIORITY_GBP_CATEGORIES = [
  "COVER",
  "PROFILE",
  "LOGO",
  "EXTERIOR",
  "INTERIOR",
  "TEAM",
] as const;

const MAX_GBP_PHOTOS = 4;

export type AnthropicMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/webp";

export interface ObservationImage {
  url: string;
  /** Short label fed into the model's text payload so it knows which image is which. */
  label: string;
}

export interface InlineImage {
  media_type: AnthropicMediaType;
  data: string; // base64-encoded
  label: string;
}

export interface BrandImageCorpus {
  business: {
    id: string;
    name: string | null;
    url: string | null;
  };
  websiteUrl: string | null;
  images: ObservationImage[];
  gbpCategories: { name: string; isPrimary: boolean }[];
}

function normalizeMediaType(ct: string | null): AnthropicMediaType {
  const base = (ct ?? "").split(";")[0].trim().toLowerCase();
  if (base === "image/jpeg" || base === "image/jpg") return "image/jpeg";
  if (base === "image/png") return "image/png";
  if (base === "image/gif") return "image/gif";
  if (base === "image/webp") return "image/webp";
  throw new Error(
    `observation-source-images: unsupported media type '${ct ?? "(none)"}'`,
  );
}

export async function fetchAsInlineImage(
  url: string,
): Promise<{ media_type: AnthropicMediaType; data: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`observation-source-images: fetch ${res.status} for ${url}`);
  }
  const media_type = normalizeMediaType(res.headers.get("content-type"));
  const bytes = Buffer.from(await res.arrayBuffer());
  return { media_type, data: bytes.toString("base64") };
}

/**
 * Build the per-brand image corpus shared by all observation-class generators.
 * Returns an ordered ObservationImage[] (website screenshot first, logo,
 * GBP cover, GBP logo, priority-category GBP photos), capped at the number of
 * images each generator actually needs.
 */
export async function assembleBrandImageCorpus(
  businessId: string,
): Promise<BrandImageCorpus> {
  const [biz] = await sql`
    SELECT id, name, url,
           business_website_screenshot, business_logo, business_favicon,
           gbp_cover_asset_id, gbp_logo_asset_id
    FROM businesses
    WHERE id = ${businessId}
    LIMIT 1
  `;
  if (!biz) {
    throw new Error(`observation-source-images: business ${businessId} not found`);
  }

  const business = {
    id: biz.id as string,
    name: biz.name as string | null,
    url: biz.url as string | null,
  };
  const websiteUrl = business.url
    ? business.url.startsWith("http")
      ? business.url
      : `https://${business.url}`
    : null;

  const assetIds = [biz.gbp_cover_asset_id, biz.gbp_logo_asset_id].filter(
    Boolean,
  ) as string[];
  const assetUrls = new Map<string, string>();
  if (assetIds.length) {
    const rows = await sql`
      SELECT id, storage_url FROM media_assets WHERE id = ANY(${assetIds})
    `;
    for (const r of rows) {
      if (r.storage_url) assetUrls.set(r.id as string, r.storage_url as string);
    }
  }

  const photoRows = await sql`
    SELECT gbp_media_url, category
    FROM gbp_photo_sync
    WHERE business_id = ${businessId}
      AND gbp_media_url IS NOT NULL
      AND category = ANY(${PRIORITY_GBP_CATEGORIES as unknown as string[]})
    ORDER BY
      array_position(${PRIORITY_GBP_CATEGORIES as unknown as string[]}, category),
      synced_at DESC NULLS LAST
    LIMIT ${MAX_GBP_PHOTOS}
  `;

  const images: ObservationImage[] = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined, label: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, label });
  };
  push(biz.business_website_screenshot as string | null, "website homepage screenshot");
  push(biz.business_logo as string | null, "brand logo");
  if (biz.gbp_cover_asset_id) push(assetUrls.get(biz.gbp_cover_asset_id as string), "GBP cover photo");
  if (biz.gbp_logo_asset_id) push(assetUrls.get(biz.gbp_logo_asset_id as string), "GBP logo");
  for (const r of photoRows) {
    push(r.gbp_media_url as string, `GBP photo (${r.category as string})`);
  }

  const catRows = await sql`
    SELECT gc.name, sgc.is_primary
    FROM business_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.business_id = ${businessId}
    ORDER BY sgc.is_primary DESC, gc.name ASC
  `;
  const gbpCategories = catRows.map((r) => ({
    name: r.name as string,
    isPrimary: Boolean(r.is_primary),
  }));

  return { business, websiteUrl, images, gbpCategories };
}
