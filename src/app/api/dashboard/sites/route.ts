import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { slugify } from "@/lib/blog";
import { cookieDomain } from "@/lib/subdomains";
import { signCookie } from "@/lib/cookie-sign";
import { getTimezoneForCoords } from "@/lib/google-timezone";

/**
 * POST /api/dashboard/sites
 * Subscriber creates a new site from the dashboard.
 * Sets provisioning_status = 'requested' — surfaces in admin action queue.
 * Body: { name, businessType, location, domain? }
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { name, businessType, location, domain, phone, existingAccounts,
    place_id, place_lat, place_lon, place_name } = body;

  if (!name || !businessType || !place_id) {
    return NextResponse.json(
      { error: "name, businessType, and a picked location are required" },
      { status: 400 }
    );
  }
  if (typeof place_id === "string" && place_id.startsWith("manual_")) {
    return NextResponse.json({ error: "Synthetic placeId cannot be saved as canonical" }, { status: 400 });
  }
  if (typeof place_lat !== "number" || typeof place_lon !== "number") {
    return NextResponse.json({ error: "place_lat and place_lon must be numbers" }, { status: 400 });
  }

  const blogSlug = slugify(name);
  const url = domain ? `https://${domain}` : null;

  // Ensure slug uniqueness
  const [existingSlug] = await sql`SELECT id FROM businesses WHERE blog_slug = ${blogSlug}`;
  const finalSlug = existingSlug
    ? `${blogSlug}-${Date.now().toString(36).slice(-4)}`
    : blogSlug;

  // Store provisioning metadata
  const metaObj: Record<string, unknown> = {};
  if (existingAccounts?.length) metaObj.existing_accounts = existingAccounts;
  if (phone) metaObj.phone = phone;
  const metadata = JSON.stringify(metaObj);

  // Resolve timezone from canonical place coords (Google Time Zone API).
  // Failures leave tz NULL — backfill script can populate later.
  const timezone = await getTimezoneForCoords(place_lat, place_lon);

  const [site] = await sql`
    INSERT INTO businesses (
      billing_account_id, name, domain, url, business_type, location,
      place_id, place_lat, place_lon, place_name, place_set_at, timezone,
      blog_slug, provisioning_status, metadata
    )
    VALUES (
      ${session.subscriptionId},
      ${name},
      ${domain || null},
      ${url},
      ${businessType},
      ${location || place_name},
      ${place_id},
      ${place_lat},
      ${place_lon},
      ${place_name || null},
      NOW(),
      ${timezone},
      ${finalSlug},
      'requested',
      ${metadata}::jsonb
    )
    RETURNING id, name, blog_slug, provisioning_status
  `;

  // Update session cookie to include the new site and switch to it
  const allSites = await sql`
    SELECT id, name, url FROM businesses
    WHERE billing_account_id = ${session.subscriptionId} AND is_active = true
    ORDER BY created_at ASC
  `;

  const updated = {
    ...session,
    sites: allSites.map((s) => ({ id: s.id as string, name: s.name as string, url: (s.url as string) || "" })),
    activeSiteId: site.id as string,
  };

  const dom = cookieDomain();
  const response = NextResponse.json({ site });
  response.cookies.set("tp_session", signCookie(updated), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    ...(dom && { domain: dom }),
  });

  return response;
}
