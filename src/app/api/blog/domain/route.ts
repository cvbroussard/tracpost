import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { addDomain, removeDomain, verifyDomain } from "@/lib/vercel-domains";
import { isReservedSlug } from "@/lib/urls";

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

    // Block reserved slugs (admin, blog, projects, tracpost, etc.)
    if (isReservedSlug(siteSlug)) {
      return NextResponse.json({
        error: `Slug "${siteSlug}" is reserved and cannot be assigned to a tenant. Use a different domain.`,
      }, { status: 400 });
    }

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

    // 4. Build DNS records
    const CNAME_TARGET = "cname.vercel-dns.com";
    const dnsRecords: Array<{ type: string; name: string; value: string; purpose: string }> = [];

    // TXT verification records (only when Vercel requires ownership proof)
    for (const v of (blogResult.verification || [])) {
      dnsRecords.push({ type: v.type.toUpperCase(), name: v.domain, value: v.value, purpose: `Verify ${blogDomain}` });
    }
    for (const v of (projectsResult.verification || [])) {
      dnsRecords.push({ type: v.type.toUpperCase(), name: v.domain, value: v.value, purpose: `Verify ${projectsDomain}` });
    }

    // CNAME records — always cname.vercel-dns.com
    dnsRecords.push({ type: "CNAME", name: "blog", value: CNAME_TARGET, purpose: "Blog subdomain" });
    dnsRecords.push({ type: "CNAME", name: "projects", value: CNAME_TARGET, purpose: "Projects subdomain" });

    return NextResponse.json({
      success: true,
      siteSlug,
      blogDomain,
      projectsDomain,
      blogStatus: blogResult.verified ? "active" : "pending",
      projectsStatus: projectsResult.verified ? "active" : "pending",
      dnsRecords,
      message: "Domains provisioned. Send DNS records to the tenant.",
    });
  }

  if (action === "verify") {
    const [settings] = await sql`
      SELECT custom_domain FROM blog_settings WHERE site_id = ${site_id}
    `;
    const blogDomain = settings?.custom_domain as string;
    if (!blogDomain) {
      return NextResponse.json({ error: "No custom domain configured" }, { status: 400 });
    }

    const projectsDomain = blogDomain.replace("blog.", "projects.");

    const [blogStatus, projectsStatus] = await Promise.all([
      verifyDomain(blogDomain),
      verifyDomain(projectsDomain),
    ]);

    return NextResponse.json({
      blogDomain,
      projectsDomain,
      blog: blogStatus,
      projects: projectsStatus,
    });
  }

  if (action === "send-dns") {
    const { dnsRecords } = body;
    if (!dnsRecords || !Array.isArray(dnsRecords)) {
      return NextResponse.json({ error: "dnsRecords required" }, { status: 400 });
    }

    // Get tenant owner email + site name
    const [owner] = await sql`
      SELECT u.email, u.name
      FROM users u
      JOIN subscriptions sub ON sub.id = u.subscription_id
      JOIN sites s ON s.subscription_id = sub.id
      WHERE s.id = ${site_id} AND u.role = 'owner'
    `;
    if (!owner?.email) {
      return NextResponse.json({ error: "Tenant owner email not found" }, { status: 404 });
    }

    const [siteRow] = await sql`SELECT name FROM sites WHERE id = ${site_id}`;
    const siteName = (siteRow?.name as string) || "Your site";

    // Get the custom domain to derive the root domain for nav link instructions
    const [blogSettings] = await sql`SELECT custom_domain FROM blog_settings WHERE site_id = ${site_id}`;
    const customDomain = (blogSettings?.custom_domain as string) || "";
    const rootDomain = customDomain.replace("blog.", "");

    const { sendDnsInstructionsEmail } = await import("@/lib/email");
    const sent = await sendDnsInstructionsEmail({
      to: owner.email as string,
      tenantName: (owner.name as string) || "there",
      siteName,
      domain: rootDomain,
      dnsRecords,
    });

    return NextResponse.json({ sent, to: owner.email });
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
