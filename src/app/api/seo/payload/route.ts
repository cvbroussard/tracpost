import { sql } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { analyzePageSeo } from "@/lib/seo/analyzer";
import { generateSchemaForPage } from "@/lib/seo/schema";
import type { SeoPayload, SiteConfig } from "@/lib/seo/types";

/**
 * GET /api/seo/payload?url=X&site_id=Y&api_key=Z
 *
 * Public endpoint authenticated via API key query param (for script tag use).
 * Fetches page HTML server-side, analyzes SEO, generates missing schema/meta.
 * Caches results in seo_content table.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  const siteId = searchParams.get("site_id");
  const apiKey = searchParams.get("api_key");

  if (!url || !siteId) {
    return NextResponse.json(
      { error: "url and site_id are required" },
      { status: 400 }
    );
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
      throw new Error("Invalid protocol");
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Authenticate: API key required
  if (!apiKey) {
    return NextResponse.json(
      { error: "api_key is required" },
      { status: 401 }
    );
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const apiKeyHash = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const subRows = await sql`
    SELECT s.id AS subscription_id
    FROM subscriptions s
    WHERE s.api_key_hash = ${apiKeyHash} AND s.is_active = true
  `;

  if (subRows.length === 0) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  const subscriptionId = subRows[0].subscription_id;

  // Verify site belongs to subscription
  const siteRows = await sql`
    SELECT id, name, url, metadata
    FROM sites
    WHERE id = ${siteId} AND subscription_id = ${subscriptionId}
  `;

  if (siteRows.length === 0) {
    return NextResponse.json(
      { error: "Site not found or not authorized" },
      { status: 404 }
    );
  }

  const site = siteRows[0];

  // Check cache: return cached payload if fresh (< 1 hour)
  const cached = await sql`
    SELECT structured_data, meta_title, meta_description,
           og_title, og_description, og_image, canonical_url, updated_at
    FROM seo_content
    WHERE site_id = ${siteId} AND url = ${parsedUrl.href}
      AND updated_at > NOW() - INTERVAL '1 hour'
    ORDER BY updated_at DESC
    LIMIT 1
  `;

  if (cached.length > 0) {
    const c = cached[0];
    const payload: SeoPayload = {
      schema: (c.structured_data as Record<string, unknown>[]) || [],
      meta: {
        ...(c.meta_description && { description: c.meta_description as string }),
        ...(c.meta_title && { title: c.meta_title as string }),
      },
      og: {
        ...(c.og_title && { title: c.og_title as string }),
        ...(c.og_description && { description: c.og_description as string }),
        ...(c.og_image && { image: c.og_image as string }),
      },
      canonical: (c.canonical_url as string) || null,
    };

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // Fetch page HTML
  let html: string;
  try {
    const fetchRes = await fetch(parsedUrl.href, {
      headers: {
        "User-Agent": "TracPost-SEO/1.0 (+https://tracpost.com)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!fetchRes.ok) {
      return NextResponse.json(
        { error: `Failed to fetch page: ${fetchRes.status}` },
        { status: 502 }
      );
    }

    html = await fetchRes.text();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Fetch failed";
    return NextResponse.json(
      { error: `Failed to fetch page: ${message}` },
      { status: 502 }
    );
  }

  // Analyze existing SEO
  const analysis = analyzePageSeo(parsedUrl.href, html);

  // Build site config from site metadata
  const metadata = (site.metadata || {}) as Record<string, unknown>;
  const siteConfig: SiteConfig = {
    name: site.name as string,
    url: (site.url as string) || parsedUrl.origin,
    description: metadata.description as string | undefined,
    phone: metadata.phone as string | undefined,
    email: metadata.email as string | undefined,
    logo: metadata.logo as string | undefined,
    socialLinks: metadata.socialLinks as string[] | undefined,
    priceRange: metadata.priceRange as string | undefined,
    openingHours: metadata.openingHours as string[] | undefined,
    serviceArea: metadata.serviceArea as string | undefined,
    services: metadata.services as SiteConfig["services"],
    address: metadata.address as SiteConfig["address"],
  };

  // Generate missing schemas
  const schemas = generateSchemaForPage(
    analysis.pageType,
    analysis,
    siteConfig
  );

  // Build payload (only missing elements)
  const payload: SeoPayload = {
    schema: schemas,
    meta: {},
    og: {},
    canonical: null,
  };

  if (analysis.missing.metaDescription && analysis.existing.ogDescription) {
    payload.meta.description = analysis.existing.ogDescription;
  }

  if (analysis.missing.ogTitle && analysis.existing.metaTitle) {
    payload.og.title = analysis.existing.metaTitle;
  }

  if (analysis.missing.ogDescription && analysis.existing.metaDescription) {
    payload.og.description = analysis.existing.metaDescription;
  }

  if (analysis.missing.ogUrl) {
    payload.og.url = parsedUrl.href;
  }

  if (analysis.missing.canonical) {
    payload.canonical = parsedUrl.href;
  }

  // Cache in seo_content
  try {
    await sql`
      INSERT INTO seo_content (site_id, page_type, page_id, url, meta_title,
        meta_description, og_title, og_description, og_image,
        canonical_url, structured_data, status, updated_at)
      VALUES (
        ${siteId}, ${analysis.pageType}, ${parsedUrl.pathname},
        ${parsedUrl.href}, ${payload.meta.title || null},
        ${payload.meta.description || null}, ${payload.og.title || null},
        ${payload.og.description || null}, ${payload.og.image || null},
        ${payload.canonical}, ${JSON.stringify(schemas)},
        'active', NOW()
      )
      ON CONFLICT (site_id, page_type, page_id)
      DO UPDATE SET
        url = EXCLUDED.url,
        meta_title = EXCLUDED.meta_title,
        meta_description = EXCLUDED.meta_description,
        og_title = EXCLUDED.og_title,
        og_description = EXCLUDED.og_description,
        og_image = EXCLUDED.og_image,
        canonical_url = EXCLUDED.canonical_url,
        structured_data = EXCLUDED.structured_data,
        updated_at = NOW()
    `;
  } catch {
    // Cache failure is non-fatal — still return the payload
  }

  // Also store an audit record
  try {
    await sql`
      INSERT INTO seo_audits (site_id, page_type, page_id, url, audit_data, seo_score, issues)
      VALUES (
        ${siteId}, ${analysis.pageType}, ${parsedUrl.pathname},
        ${parsedUrl.href},
        ${JSON.stringify(analysis)},
        ${calculateSeoScore(analysis)},
        ${JSON.stringify(Object.entries(analysis.missing).filter(([, v]) => v).map(([k]) => k))}
      )
    `;
  } catch {
    // Audit failure is non-fatal
  }

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * Handle CORS preflight for the client script.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

function calculateSeoScore(analysis: {
  missing: Record<string, boolean>;
  existing: { jsonLdTypes: string[] };
}): number {
  let score = 100;
  const penalties: Record<string, number> = {
    metaDescription: 20,
    canonical: 10,
    ogTitle: 10,
    ogDescription: 10,
    ogImage: 10,
    ogUrl: 5,
    jsonLd: 15,
  };

  for (const [key, isMissing] of Object.entries(analysis.missing)) {
    if (isMissing && penalties[key]) {
      score -= penalties[key];
    }
  }

  return Math.max(0, score);
}
