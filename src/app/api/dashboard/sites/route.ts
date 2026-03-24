import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { slugify } from "@/lib/blog";
import { cookieDomain } from "@/lib/subdomains";

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
  const { name, businessType, location, domain } = body;

  if (!name || !businessType || !location) {
    return NextResponse.json(
      { error: "name, businessType, and location are required" },
      { status: 400 }
    );
  }

  const blogSlug = slugify(name);
  const url = domain ? `https://${domain}` : null;

  // Ensure slug uniqueness
  const [existingSlug] = await sql`SELECT id FROM sites WHERE blog_slug = ${blogSlug}`;
  const finalSlug = existingSlug
    ? `${blogSlug}-${Date.now().toString(36).slice(-4)}`
    : blogSlug;

  const [site] = await sql`
    INSERT INTO sites (subscriber_id, name, domain, url, business_type, location, blog_slug, provisioning_status)
    VALUES (
      ${session.subscriberId},
      ${name},
      ${domain || null},
      ${url},
      ${businessType},
      ${location},
      ${finalSlug},
      'requested'
    )
    RETURNING id, name, blog_slug, provisioning_status
  `;

  // Update session cookie to include the new site and switch to it
  const allSites = await sql`
    SELECT id, name, url FROM sites
    WHERE subscriber_id = ${session.subscriberId} AND deleted_at IS NULL
    ORDER BY created_at ASC
  `;

  const updated = {
    ...session,
    sites: allSites.map((s) => ({ id: s.id as string, name: s.name as string, url: (s.url as string) || "" })),
    activeSiteId: site.id as string,
  };

  const dom = cookieDomain();
  const response = NextResponse.json({ site });
  response.cookies.set("tp_session", JSON.stringify(updated), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    ...(dom && { domain: dom }),
  });

  return response;
}
