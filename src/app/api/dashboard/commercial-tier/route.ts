import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * GET /api/dashboard/commercial-tier?site_id=xxx
 *   Returns site's currently-declared tier + all available picker tiers.
 *
 * POST /api/dashboard/commercial-tier
 *   Body: { site_id: string, tier_slug: string }
 *   Sets site's commercial_tier. Returns the new tier.
 *
 * Both endpoints validate that the site belongs to the caller's
 * subscription (via session.sites list).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) return NextResponse.json({ error: "site_id required" }, { status: 400 });
  if (!session.sites.some((s) => s.id === siteId)) {
    return NextResponse.json({ error: "Site not in your subscription" }, { status: 403 });
  }

  const [siteRow] = await sql`
    SELECT s.id, s.name, ct.slug, ct.label
    FROM businesses s
    LEFT JOIN commercial_tiers ct ON ct.id = s.commercial_tier_id
    WHERE s.id = ${siteId}
  `;
  if (!siteRow) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // Picker shows only target tiers; non-target tiers are internal
  // classification universe (used for CMA competitor filtering, not
  // for subscriber selection).
  const tiers = await sql`
    SELECT slug, label, description
    FROM commercial_tiers
    WHERE is_target = true
    ORDER BY display_order ASC
  `;

  return NextResponse.json({
    site: { id: siteRow.id, name: siteRow.name },
    currentTier: siteRow.slug ? { slug: siteRow.slug, label: siteRow.label } : null,
    pickerTiers: tiers,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { site_id?: string; tier_slug?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const siteId = body.site_id;
  const tierSlug = body.tier_slug;
  if (!siteId || !tierSlug) {
    return NextResponse.json({ error: "site_id and tier_slug required" }, { status: 400 });
  }
  if (!session.sites.some((s) => s.id === siteId)) {
    return NextResponse.json({ error: "Site not in your subscription" }, { status: 403 });
  }

  // Look up tier by slug — also validates it's a target tier (only
  // target tiers should be subscriber-selectable; classification-only
  // tiers like 'below_target' and 'out_of_category' must not be picked).
  const [tier] = await sql`
    SELECT id, slug, label, is_target FROM commercial_tiers WHERE slug = ${tierSlug}
  `;
  if (!tier) return NextResponse.json({ error: "Unknown tier slug" }, { status: 400 });
  if (!tier.is_target) {
    return NextResponse.json({ error: "Tier is not subscriber-selectable" }, { status: 400 });
  }

  await sql`
    UPDATE businesses SET commercial_tier_id = ${tier.id} WHERE id = ${siteId}
  `;

  return NextResponse.json({
    site_id: siteId,
    tier: { slug: tier.slug, label: tier.label },
  });
}
