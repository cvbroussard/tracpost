import { classifyPage } from "./classifier";
import type { SeoAnalysis } from "./types";

/**
 * Analyze a page's existing SEO elements and identify what's missing.
 * Returns structured data about present vs absent tags.
 */
export function analyzePageSeo(url: string, html: string): SeoAnalysis {
  const pageType = classifyPage(url, html);

  // Extract existing elements
  const metaTitle = extractMetaContent(html, "title") ?? extractTitle(html);
  const metaDescription = extractMetaContent(html, "description");
  const canonical = extractLink(html, "canonical");
  const ogTitle = extractMetaProperty(html, "og:title");
  const ogDescription = extractMetaProperty(html, "og:description");
  const ogImage = extractMetaProperty(html, "og:image");
  const ogUrl = extractMetaProperty(html, "og:url");
  const ogType = extractMetaProperty(html, "og:type");
  const jsonLdTypes = extractJsonLdTypes(html);

  return {
    url,
    pageType,
    existing: {
      metaTitle,
      metaDescription,
      canonical,
      ogTitle,
      ogDescription,
      ogImage,
      ogUrl,
      ogType,
      jsonLdTypes,
    },
    missing: {
      metaDescription: !metaDescription,
      canonical: !canonical,
      ogTitle: !ogTitle,
      ogDescription: !ogDescription,
      ogImage: !ogImage,
      ogUrl: !ogUrl,
      jsonLd: jsonLdTypes.length === 0,
    },
  };
}

// ── HTML extraction helpers ──────────────────────────────────

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : null;
}

function extractMetaContent(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*)["']`,
    "i"
  );
  const match = html.match(re);
  if (match) return decodeEntities(match[1]);

  // Try reversed attribute order: content before name
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${name}["']`,
    "i"
  );
  const match2 = html.match(re2);
  return match2 ? decodeEntities(match2[1]) : null;
}

function extractMetaProperty(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+property=["']${property.replace(":", "\\:")}["'][^>]+content=["']([^"']*)["']`,
    "i"
  );
  const match = html.match(re);
  if (match) return decodeEntities(match[1]);

  // Try reversed attribute order
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${property.replace(":", "\\:")}["']`,
    "i"
  );
  const match2 = html.match(re2);
  return match2 ? decodeEntities(match2[1]) : null;
}

function extractLink(html: string, rel: string): string | null {
  const re = new RegExp(
    `<link[^>]+rel=["']${rel}["'][^>]+href=["']([^"']*)["']`,
    "i"
  );
  const match = html.match(re);
  if (match) return match[1];

  const re2 = new RegExp(
    `<link[^>]+href=["']([^"']*)["'][^>]+rel=["']${rel}["']`,
    "i"
  );
  const match2 = html.match(re2);
  return match2 ? match2[1] : null;
}

function extractJsonLdTypes(html: string): string[] {
  const types: string[] = [];
  const scriptRegex =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;

  while ((scriptMatch = scriptRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(scriptMatch[1]);
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item["@type"]) types.push(String(item["@type"]));
        }
      } else if (data["@type"]) {
        types.push(String(data["@type"]));
      }
      if (data["@graph"] && Array.isArray(data["@graph"])) {
        for (const item of data["@graph"]) {
          if (item["@type"]) types.push(String(item["@type"]));
        }
      }
    } catch {
      // Skip malformed JSON-LD
    }
  }

  return types;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}
