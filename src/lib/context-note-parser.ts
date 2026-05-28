import { sql } from "@/lib/db";

interface ParsedEntity {
  entityId: string;
  name: string;
  urls: string[];
}

interface ParseResult {
  vendorIds: string[];
  vendorLinks: string[]; // "Name: url" format for blog generator
}

/**
 * Parse vendor hashtags and inline URLs from a context note.
 *
 * Hashtags: #MitchelandMitchel → matches vendor slug
 * URLs: https://thermador.com/wine-refrigeration → associated with
 *   the nearest preceding hashtag, or standalone if no hashtag nearby
 *
 * Returns brand IDs for asset_brands and a link array for the blog generator.
 */
export async function parseContextNote(
  contextNote: string,
  siteId: string
): Promise<ParseResult> {
  if (!contextNote) return { vendorIds: [], vendorLinks: [] };

  // Extract all hashtags
  const hashtagMatches = contextNote.match(/#([a-zA-Z0-9_]+)/g) || [];
  const hashtags = hashtagMatches.map((h) => h.slice(1).toLowerCase());

  // Extract all URLs
  const urlMatches = contextNote.match(/https?:\/\/[^\s,]+/g) || [];

  if (hashtags.length === 0 && urlMatches.length === 0) {
    return { vendorIds: [], vendorLinks: [] };
  }

  // Fetch all brands for this subscriber (brands = slot 1 / link_in_post behavior)
  const brands = await sql`
    SELECT id, name, slug, url FROM brands WHERE business_id = ${siteId}
  `;

  const brandMap = new Map<string, { id: string; name: string; url: string | null }>();
  for (const b of brands) {
    brandMap.set(b.slug as string, {
      id: b.id as string,
      name: b.name as string,
      url: b.url as string | null,
    });
  }

  // Match hashtags to brands
  const matched = new Map<string, ParsedEntity>();
  for (const tag of hashtags) {
    const brand = brandMap.get(tag);
    if (brand) {
      if (!matched.has(brand.id)) {
        matched.set(brand.id, {
          entityId: brand.id,
          name: brand.name,
          urls: brand.url ? [brand.url] : [],
        });
      }
    }
  }

  // Associate URLs with the nearest preceding hashtag vendor,
  // or treat as standalone links
  for (const url of urlMatches) {
    const urlIndex = contextNote.indexOf(url);

    // Find the nearest hashtag before this URL
    let nearestEntity: ParsedEntity | null = null;
    let nearestDist = Infinity;

    for (const htMatch of hashtagMatches) {
      const htIndex = contextNote.indexOf(htMatch);
      if (htIndex < urlIndex) {
        const dist = urlIndex - htIndex;
        if (dist < nearestDist) {
          const slug = htMatch.slice(1).toLowerCase();
          const brand = brandMap.get(slug);
          if (brand && matched.has(brand.id)) {
            nearestEntity = matched.get(brand.id)!;
            nearestDist = dist;
          }
        }
      }
    }

    // Also try matching URL domain to an entity
    if (!nearestEntity) {
      try {
        const domain = new URL(url).hostname.replace(/^www\./, "");
        for (const [, entity] of matched) {
          if (entity.urls.some((u) => u.includes(domain))) {
            nearestEntity = entity;
            break;
          }
        }
      } catch { /* invalid URL */ }
    }

    if (nearestEntity) {
      if (!nearestEntity.urls.includes(url)) {
        nearestEntity.urls.push(url);
      }
    }
    // Standalone URLs without a vendor match are ignored —
    // they'll pass through to the AI naturally via the context note
  }

  // Build results
  const vendorIds: string[] = [];
  const vendorLinks: string[] = [];

  for (const [, entity] of matched) {
    vendorIds.push(entity.entityId);
    for (const url of entity.urls) {
      vendorLinks.push(`${entity.name}: ${url}`);
    }
  }

  return { vendorIds, vendorLinks };
}

/**
 * Strip hashtags from a context note for cleaner display/AI input.
 * Keeps the rest of the text intact.
 */
export function stripHashtags(note: string): string {
  return note.replace(/#[a-zA-Z0-9_]+/g, "").replace(/\s{2,}/g, " ").trim();
}
