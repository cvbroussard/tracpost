import { verifyCookie } from "@/lib/cookie-sign";
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
  if (!verifyCookie(adminCookie)) {
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
    const rootDomain = domainClean.replace(/^www\./, "");
    const lastDot = rootDomain.lastIndexOf(".");
    const siteSlug = lastDot > 0 ? rootDomain.slice(0, lastDot).replace(/[^a-z0-9-]/g, "") : rootDomain;
    const wwwDomain = `www.${rootDomain}`;

    // Block reserved slugs (admin, blog, projects, tracpost, etc.)
    if (isReservedSlug(siteSlug)) {
      return NextResponse.json({
        error: `Slug "${siteSlug}" is reserved and cannot be assigned to a tenant. Use a different domain.`,
      }, { status: 400 });
    }

    // 2. Update blog_settings — set slug + custom_domain (root domain only;
    // middleware resolves tenant content by looking up the root domain and
    // rewriting /blog, /projects, /about, /work, /contact as tenant paths).
    await sql`
      UPDATE blog_settings
      SET subdomain = ${siteSlug},
          custom_domain = ${rootDomain},
          updated_at = NOW()
      WHERE site_id = ${site_id}
    `;

    // Also set blog_slug on sites table
    await sql`
      UPDATE sites SET blog_slug = ${siteSlug}, updated_at = NOW()
      WHERE id = ${site_id}
    `;

    // 3. Add root + www to the main TracPost Vercel project.
    //    No per-tenant project; tenant content is served via middleware.
    const rootResult = await addDomain(rootDomain);
    const wwwResult = await addDomain(wwwDomain);

    if (!rootResult.success && !wwwResult.success) {
      return NextResponse.json({
        step: "vercel",
        error: rootResult.error || wwwResult.error,
        siteSlug,
        rootDomain,
        wwwDomain,
        message: "Slug updated in DB but Vercel domain adds failed. Add manually in Vercel dashboard.",
      }, { status: 502 });
    }

    // 4. Build DNS records
    const dnsRecords: Array<{ type: string; name: string; value: string; purpose: string }> = [];

    // TXT verification records (only when Vercel requires ownership proof)
    for (const v of (rootResult.verification || [])) {
      dnsRecords.push({ type: v.type.toUpperCase(), name: v.domain, value: v.value, purpose: `Verify ${rootDomain}` });
    }
    for (const v of (wwwResult.verification || [])) {
      dnsRecords.push({ type: v.type.toUpperCase(), name: v.domain, value: v.value, purpose: `Verify ${wwwDomain}` });
    }

    // Root A record (apex can't CNAME) + www CNAME
    dnsRecords.push({ type: "A", name: "@", value: "76.76.21.21", purpose: "Root domain → Vercel" });
    dnsRecords.push({ type: "CNAME", name: "www", value: "cname.vercel-dns.com", purpose: "www subdomain → Vercel" });

    return NextResponse.json({
      success: true,
      siteSlug,
      customDomain: rootDomain,
      wwwDomain,
      status: rootResult.verified ? "active" : "pending",
      dnsRecords,
      message: "Domain provisioned. Send DNS records to the tenant.",
    });
  }

  if (action === "verify") {
    const [settings] = await sql`
      SELECT custom_domain FROM blog_settings WHERE site_id = ${site_id}
    `;
    const rootDomain = settings?.custom_domain as string;
    if (!rootDomain) {
      return NextResponse.json({ error: "No custom domain configured" }, { status: 400 });
    }

    const wwwDomain = `www.${rootDomain}`;
    const [rootStatus, wwwStatus] = await Promise.all([
      verifyDomain(rootDomain),
      verifyDomain(wwwDomain),
    ]);

    return NextResponse.json({
      customDomain: rootDomain,
      wwwDomain,
      root: rootStatus,
      www: wwwStatus,
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

    // Custom domain is the root domain (post-2026-04 rewrite — no more blog.* subdomain pattern)
    const [blogSettings] = await sql`SELECT custom_domain FROM blog_settings WHERE site_id = ${site_id}`;
    const rootDomain = (blogSettings?.custom_domain as string) || "";

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
    const rootDomain = settings?.custom_domain as string;
    if (!rootDomain) {
      return NextResponse.json({ error: "No custom domain to remove" }, { status: 400 });
    }

    // Remove both root and www from Vercel main project
    const wwwDomain = `www.${rootDomain}`;
    await Promise.all([
      removeDomain(rootDomain).catch(() => undefined),
      removeDomain(wwwDomain).catch(() => undefined),
    ]);

    await sql`
      UPDATE blog_settings SET custom_domain = NULL, updated_at = NOW()
      WHERE site_id = ${site_id}
    `;

    return NextResponse.json({ removed: true, domain: rootDomain });
  }

  return NextResponse.json({ error: "Unknown action. Use 'provision', 'verify', or 'remove'" }, { status: 400 });
}
