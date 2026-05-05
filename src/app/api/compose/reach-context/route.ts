import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";

/**
 * GET /api/compose/reach-context
 *
 * Returns the data the Compose Reach step needs to render its initial
 * state for the active site:
 *
 *   - canonical: the cascaded canonical place per project_tracpost_canonical_place
 *     memory (sites.place_id → FB Page lat/lon → sites.location → null)
 *   - defaultRadius: sites.reach_default_radius_miles
 *   - isEnterprise: tier flag — Mode picker (Organic/Paid/Both) is enterprise-only;
 *     mid-tier subscribers skip the Reach step entirely
 *   - canonicalSource: which level of the cascade resolved the canonical
 *     (so the UI can hint at "first time setting this — pick a precise location"
 *     when canonical came from the loose sites.location text)
 */
export async function GET(_req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const siteId = session.activeSiteId;
  if (!siteId) return NextResponse.json({ error: "No active site" }, { status: 400 });

  const isEnterprise = session.plan.toLowerCase().includes("enterprise");

  // Fetch canonical fields + the legacy fallbacks
  const [siteRow] = await sql`
    SELECT place_id, place_lat, place_lon, place_name, place_set_at,
           reach_default_radius_miles, location, name
    FROM sites
    WHERE id = ${siteId}
    LIMIT 1
  `;
  if (!siteRow) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  // Cascade: canonical → FB Page lat/lon → sites.location text (display only here)
  let canonical: {
    placeId: string | null;
    latitude: number | null;
    longitude: number | null;
    placeName: string | null;
    source: "canonical" | "fb_page" | "site_location" | "none";
  } = {
    placeId: null,
    latitude: null,
    longitude: null,
    placeName: null,
    source: "none",
  };

  if (siteRow.place_id && siteRow.place_lat != null && siteRow.place_lon != null) {
    canonical = {
      placeId: siteRow.place_id as string,
      latitude: Number(siteRow.place_lat),
      longitude: Number(siteRow.place_lon),
      placeName: (siteRow.place_name as string | null) || null,
      source: "canonical",
    };
  } else {
    // Try FB Page lat/lon cache from platform_assets metadata
    const [fbPage] = await sql`
      SELECT pa.metadata
      FROM site_platform_assets spa
      JOIN platform_assets pa ON pa.id = spa.platform_asset_id
      JOIN social_accounts sa ON sa.id = pa.social_account_id
      WHERE spa.site_id = ${siteId}
        AND pa.platform = 'facebook'
        AND spa.is_primary = true
        AND sa.subscription_id = ${session.subscriptionId}
      LIMIT 1
    `;
    const fbMeta = (fbPage?.metadata as Record<string, unknown> | undefined) ?? null;
    const fbLocation = fbMeta?.location as { latitude?: number; longitude?: number; city?: string; state?: string } | undefined;
    if (fbLocation?.latitude != null && fbLocation?.longitude != null) {
      const cityState = [fbLocation.city, fbLocation.state].filter(Boolean).join(", ");
      canonical = {
        placeId: null,
        latitude: fbLocation.latitude,
        longitude: fbLocation.longitude,
        placeName: cityState || (siteRow.location as string | null) || null,
        source: "fb_page",
      };
    } else if (siteRow.location) {
      // Don't geocode here — keep API fast. Display the text; the UI prompts
      // subscriber to pick a precise place via autocomplete if they want a
      // map-rendered radius (otherwise the legacy cascade still applies at
      // publish time via the Quick Boost machinery).
      canonical = {
        placeId: null,
        latitude: null,
        longitude: null,
        placeName: siteRow.location as string,
        source: "site_location",
      };
    }
  }

  return NextResponse.json({
    canonical,
    defaultRadius: (siteRow.reach_default_radius_miles as number) || 10,
    isEnterprise,
    siteName: siteRow.name as string,
  });
}
