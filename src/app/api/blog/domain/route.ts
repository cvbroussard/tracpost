import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { addDomain, removeDomain, verifyDomain } from "@/lib/vercel-domains";

/**
 * POST /api/blog/domain — Custom domain provisioning for blogs.
 *
 * Actions:
 * - { action: "provision", site_id, domain }
 *     1. Derives siteSlug from domain (e.g., b2construct.com → b2construct)
 *     2. Updates blog_settings with slug + custom_domain
 *     3. Adds blog.[domain] to Vercel
 *     4. Returns DNS records tenant needs to add
 *
 * - { action: "verify", site_id }
 *     Checks if DNS is configured and domain is active
 *
 * - { action: "remove", site_id }
 *     Removes custom domain from Vercel + clears blog_settings
 */
export async function POST(req: NextRequest) {
  // Admin-only — check tp_admin cookie
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie !== "authenticated") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { action, site_id } = body;

  if (!site_id || !action) {
    return NextResponse.json({ error: "site_id and action required" }, { status: 400 });
  }

  if (action === "provision") {
    const { domain } = body;
    if (!domain) {
      return NextResponse.json({ error: "domain required (e.g., b2construct.com)" }, { status: 400 });
    }

    // 1. Derive siteSlug from domain — strip TLD
    const domainClean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "").toLowerCase();
    const lastDot = domainClean.lastIndexOf(".");
    const siteSlug = lastDot > 0 ? domainClean.slice(0, lastDot).replace(/[^a-z0-9-]/g, "") : domainClean;
    const blogDomain = `blog.${domainClean}`;
    const projectsDomain = `projects.${domainClean}`;

    // 2. Update blog_settings — set slug + custom_domain
    await sql`
      UPDATE blog_settings
      SET subdomain = ${siteSlug},
          custom_domain = ${blogDomain},
          updated_at = NOW()
      WHERE site_id = ${site_id}
    `;

    // Also set blog_slug on sites table
    await sql`
      UPDATE sites SET blog_slug = ${siteSlug}, updated_at = NOW()
      WHERE id = ${site_id}
    `;

    // 3. Add blog.[domain] and projects.[domain] to Vercel
    const blogResult = await addDomain(blogDomain);
    const projectsResult = await addDomain(projectsDomain);
    const result = blogResult;

    if (!blogResult.success && !projectsResult.success) {
      return NextResponse.json({
        step: "vercel",
        error: blogResult.error || projectsResult.error,
        siteSlug,
        blogDomain,
        projectsDomain,
        message: "Slug updated in DB but Vercel domain adds failed. Add manually in Vercel dashboard.",
      }, { status: 502 });
    }

    // 4. Return DNS records for tenant
    const dnsRecords: Array<{ type: string; name: string; value: string; purpose: string }> = [];

    // Verification TXT records (if required)
    for (const res of [blogResult, projectsResult]) {
      if (res.verification && res.verification.length > 0) {
        for (const v of res.verification) {
          dnsRecords.push({
            type: v.type.toUpperCase(),
            name: v.domain,
            value: v.value,
            purpose: "Domain ownership verification",
          });
        }
      }
    }

    // CNAME records for both subdomains
    dnsRecords.push({
      type: "CNAME",
      name: "blog",
      value: "cname.vercel-dns.com",
      purpose: "Points blog subdomain to TracPost",
    });
    dnsRecords.push({
      type: "CNAME",
      name: "projects",
      value: "cname.vercel-dns.com",
      purpose: "Points projects subdomain to TracPost",
    });

    return NextResponse.json({
      success: true,
      siteSlug,
      blogDomain,
      projectsDomain,
      dnsRecords,
      message: `Blog domain provisioned. Send these DNS records to the tenant.`,
    });
  }

  if (action === "verify") {
    const [settings] = await sql`
      SELECT custom_domain FROM blog_settings WHERE site_id = ${site_id}
    `;
    const domain = settings?.custom_domain as string;
    if (!domain) {
      return NextResponse.json({ error: "No custom domain configured" }, { status: 400 });
    }

    const status = await verifyDomain(domain);
    return NextResponse.json({ domain, ...status });
  }

  if (action === "remove") {
    const [settings] = await sql`
      SELECT custom_domain FROM blog_settings WHERE site_id = ${site_id}
    `;
    const domain = settings?.custom_domain as string;
    if (!domain) {
      return NextResponse.json({ error: "No custom domain to remove" }, { status: 400 });
    }

    await removeDomain(domain);
    await sql`
      UPDATE blog_settings SET custom_domain = NULL, updated_at = NOW()
      WHERE site_id = ${site_id}
    `;

    return NextResponse.json({ removed: true, domain });
  }

  return NextResponse.json({ error: "Unknown action. Use 'provision', 'verify', or 'remove'" }, { status: 400 });
}
