import { sql } from "@/lib/db";

/**
 * Pull vendor links associated with an asset, prioritized for the prompt.
 *
 * Ported from v1 (blog-generator.ts vendor link extraction). Two sources:
 *   1. asset_brands JOIN brands — explicit subscriber/operator-tagged
 *      vendors with known URLs
 *   2. Inline URLs in the asset's context_note — extracted via regex,
 *      matched to a tagged vendor's domain when possible
 *
 * Caps at MAX_VENDOR_LINKS so the article doesn't over-link. Deep links
 * (URLs with paths) get priority over bare base URLs because they point
 * at specific products instead of homepages.
 *
 * Returns formatted strings ready for prompt injection:
 *   "Lacanche: https://lacanche.com/sully"
 *   "Brizo: https://brizo.com"
 */
const MAX_VENDOR_LINKS = 3;

export interface VendorRef {
  name: string;
  url: string;
}

export async function getVendorLinks(assetId: string): Promise<{
  /** Formatted "Name: URL" strings for the prompt. */
  formatted: string[];
  /** Structured refs for downstream use. */
  refs: VendorRef[];
}> {
  // 1. Tagged vendors via asset_brands JOIN brands
  const brandRows = await sql`
    SELECT b.name, b.url
    FROM asset_brands ab
    JOIN brands b ON b.id = ab.brand_id
    WHERE ab.asset_id = ${assetId}
  `;

  const refs: VendorRef[] = brandRows
    .filter((r) => r.url)
    .map((r) => ({ name: r.name as string, url: r.url as string }));

  // 2. Inline URLs from context_note (subscriber may paste deep links)
  const [asset] = await sql`
    SELECT context_note FROM media_assets WHERE id = ${assetId}
  `;
  const contextNote = (asset?.context_note as string | null) || "";
  const inlineUrls = contextNote.match(/https?:\/\/[^\s,)]+/g) || [];

  for (const url of inlineUrls) {
    if (refs.some((r) => r.url === url)) continue;

    // Try to attribute to a tagged vendor by domain match
    let attributedName: string | null = null;
    try {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      const matched = brandRows.find((b) => {
        const burl = b.url as string | null;
        return burl && burl.includes(domain);
      });
      if (matched) attributedName = matched.name as string;
    } catch {
      // malformed url; treat as bare
    }

    refs.push({ name: attributedName || domainOf(url) || "Source", url });
  }

  // 3. Cap with deep-link priority
  const deepLinks = refs.filter((r) => isDeepLink(r.url));
  const baseLinks = refs.filter((r) => !isDeepLink(r.url));
  const capped = [...deepLinks, ...baseLinks].slice(0, MAX_VENDOR_LINKS);

  return {
    formatted: capped.map((r) => `${r.name}: ${r.url}`),
    refs: capped,
  };
}

function isDeepLink(url: string): boolean {
  // True when there's a path segment beyond the domain (i.e., not just "domain.com" or "domain.com/")
  try {
    const u = new URL(url);
    return u.pathname.length > 1;
  } catch {
    return false;
  }
}

function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
