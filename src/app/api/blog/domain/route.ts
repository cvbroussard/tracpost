import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, AuthContext } from "@/lib/auth";
import { sql } from "@/lib/db";
import { addDomain, removeDomain, verifyDomain } from "@/lib/vercel-domains";

/**
 * POST /api/blog/domain
 *
 * Actions:
 * - { action: "set", site_id, subdomain } — set custom subdomain, add to Vercel
 * - { action: "verify", site_id } — check DNS configuration
 * - { action: "remove", site_id } — remove custom domain
 */
export async function POST(req: NextRequest) {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof NextResponse) return authResult;
  const auth = authResult as AuthContext;

  const body = await req.json();
  const { action, site_id } = body;

  if (!site_id) return NextResponse.json({ error: "site_id required" }, { status: 400 });

  // Verify ownership
  const [site] = await sql`
    SELECT s.id, s.url, bs.subdomain, bs.custom_domain
    FROM sites s
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE s.id = ${site_id} AND s.subscription_id = ${auth.subscriptionId}
  `;
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  if (action === "set") {
    const { subdomain } = body;
    if (!subdomain) return NextResponse.json({ error: "subdomain required" }, { status: 400 });

    // Build the full domain: subscriber provides "blog" → blog.hektork9.com
    // Or provides full domain: "blog.hektork9.com"
    const siteHost = site.url ? new URL(site.url as string).hostname : null;
    const fullDomain = subdomain.includes(".")
      ? subdomain
      : siteHost
        ? `${subdomain}.${siteHost}`
        : `${subdomain}.tracpost.com`;

    // Add to Vercel
    const result = await addDomain(fullDomain);

    // Store in blog_settings
    await sql`
      UPDATE blog_settings
      SET custom_domain = ${fullDomain}, updated_at = NOW()
      WHERE site_id = ${site_id}
    `;

    // Get the site's blog slug for the CUSTOM_DOMAIN_MAP env var
    const [blogSettings] = await sql`
      SELECT bs.subdomain FROM blog_settings bs WHERE bs.site_id = ${site_id}
    `;
    const siteSlug = (blogSettings?.subdomain as string) || site_id;

    return NextResponse.json({
      domain: fullDomain,
      siteSlug,
      added: result.success,
      error: result.error,
      cname_target: "cname.vercel-dns.com",
      instructions: `1. Add CNAME record: ${subdomain.includes(".") ? subdomain.split(".")[0] : subdomain} → cname.vercel-dns.com\n2. Add to CUSTOM_DOMAIN_MAP env var in Vercel: {"${fullDomain}":"${siteSlug}"}`,
    });
  }

  if (action === "verify") {
    const domain = site.custom_domain as string;
    if (!domain) return NextResponse.json({ error: "No custom domain configured" }, { status: 400 });

    const status = await verifyDomain(domain);
    return NextResponse.json(status);
  }

  if (action === "remove") {
    const domain = site.custom_domain as string;
    if (!domain) return NextResponse.json({ error: "No custom domain to remove" }, { status: 400 });

    await removeDomain(domain);
    await sql`
      UPDATE blog_settings SET custom_domain = NULL, updated_at = NOW()
      WHERE site_id = ${site_id}
    `;

    return NextResponse.json({ removed: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
