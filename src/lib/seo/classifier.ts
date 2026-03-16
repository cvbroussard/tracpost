import type { PageType } from "./types";

/**
 * Classify a page type from its URL and HTML content using heuristics.
 * No AI call — pure pattern matching.
 */
export function classifyPage(url: string, html: string): PageType {
  const path = new URL(url).pathname.toLowerCase();
  const lowerHtml = html.toLowerCase();

  // Homepage: root path or /index
  if (path === "/" || path === "/index" || path === "/index.html") {
    return "homepage";
  }

  // Blog: URL patterns
  if (
    /\/(blog|posts|articles|news|journal)\b/.test(path) ||
    /\/(blog|posts|articles)\/[^/]+/.test(path)
  ) {
    return "blog";
  }

  // Product: URL patterns + HTML signals
  if (
    /\/(product|products|shop|item|items)\/[^/]+/.test(path) ||
    /\/(p|pd|sku)\//.test(path)
  ) {
    return "product";
  }
  if (hasProductSignals(lowerHtml)) {
    return "product";
  }

  // Collection: URL patterns
  if (
    /\/(collection|collections|category|categories|catalog)\b/.test(path) ||
    /\/(shop|store)\/?$/.test(path)
  ) {
    return "collection";
  }
  if (hasCollectionSignals(lowerHtml)) {
    return "collection";
  }

  // Service: URL patterns
  if (
    /\/(service|services|solutions|offerings|what-we-do)\b/.test(path)
  ) {
    return "service";
  }
  if (hasServiceSignals(lowerHtml)) {
    return "service";
  }

  return "unknown";
}

function hasProductSignals(html: string): boolean {
  const signals = [
    'itemprop="price"',
    'itemprop="pricecurrency"',
    "add to cart",
    "add-to-cart",
    "addtocart",
    'class="product-price"',
    'class="price"',
    '"@type":"product"',
    '"@type": "product"',
  ];
  let count = 0;
  for (const sig of signals) {
    if (html.includes(sig)) count++;
    if (count >= 2) return true;
  }
  return false;
}

function hasCollectionSignals(html: string): boolean {
  const signals = [
    "product-grid",
    "product-list",
    "collection-grid",
    "catalog-grid",
    'class="products"',
    "filter-bar",
    "sort-by",
  ];
  let count = 0;
  for (const sig of signals) {
    if (html.includes(sig)) count++;
    if (count >= 2) return true;
  }
  return false;
}

function hasServiceSignals(html: string): boolean {
  const signals = [
    "our services",
    "what we offer",
    "service area",
    "book now",
    "book a consultation",
    "free estimate",
    "get a quote",
    "request a quote",
    "schedule appointment",
  ];
  let count = 0;
  for (const sig of signals) {
    if (html.includes(sig)) count++;
    if (count >= 2) return true;
  }
  return false;
}
