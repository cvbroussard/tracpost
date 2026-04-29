import { NextRequest, NextResponse } from "next/server";
import { classifyHost } from "@/lib/subdomains";
import {
  lookupTenantByCustomDomain,
  lookupCustomDomainBySlug,
} from "@/lib/custom-domain-lookup";

/**
 * Extract siteSlug from a custom subdomain.
 * blog.b2construct.com → "b2construct"
 * projects.b2construct.com → "b2construct"
 *
 * Convention: siteSlug always matches the tenant's domain name (minus TLD).
 * Platform admin ensures this during provisioning.
 */
function extractSlugFromHost(hostname: string, prefix: string): string | null {
  const host = hostname.split(":")[0];
  const prefixDot = prefix + ".";
  if (!host.startsWith(prefixDot)) return null;
  if (host === `${prefix}.tracpost.com`) return null;
  // Strip prefix and TLD
  const rest = host.slice(prefixDot.length);
  const lastDot = rest.lastIndexOf(".");
  if (lastDot === -1) return null;
  return rest.slice(0, lastDot);
}

/**
 * Subdomain-based routing middleware.
 *
 * Production:
 *   studio.tracpost.com/calendar     → rewrites to /dashboard/calendar
 *   platform.tracpost.com/subscribers → rewrites to /admin/subscribers
 *   tracpost.com/blog                → /tenant/tracpost/blog (next.config rewrite)
 *   blog.b2construct.com/my-article  → /tenant/b2construct/blog/my-article
 *   staging.tracpost.com/[slug]/...  → /tenant/[slug]/...
 *
 * Development (localhost):
 *   No rewriting — access /dashboard/* and /admin/* directly.
 */
// Marketing paths that should bounce away while a visitor has an active
// onboarding session. Once onboarding completes (cookie cleared at submit /
// at first login), the marketing site renders normally again — active
// subscribers can still read blog/pricing/etc.
const BOUNCE_DURING_ONBOARDING = new Set([
  "/",
  "/signup",
  "/login",
  "/pricing",
]);

export async function middleware(req: NextRequest) {
  const hostname = req.headers.get("host") || "localhost";
  const subdomain = classifyHost(hostname);
  const { pathname } = req.nextUrl;

  const isLocal = hostname.includes("localhost");

  // Mid-onboarding visitors get bounced from marketing pages so they don't
  // accidentally re-enter the signup funnel. Triggered only by the
  // tp_onboarding_token cookie, which is cleared on submit + first login.
  if (
    (subdomain === "marketing" || isLocal) &&
    BOUNCE_DURING_ONBOARDING.has(pathname) &&
    req.cookies.has("tp_onboarding_token")
  ) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // In development, only enforce admin auth — skip subdomain logic
  if (isLocal) {
    return gateAdmin(req, pathname);
  }

  // API routes — shared across all subdomains, pass through
  if (pathname.startsWith("/api/") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Static/shared public pages — accessible from all subdomains
  // Note: /login is NOT shared — it resolves differently per subdomain
  const sharedPaths = ["/privacy", "/terms", "/data-deletion", "/admin-login"];
  if (sharedPaths.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  const host = hostname.toLowerCase().split(":")[0];
  const isTracpostMarketing =
    host === "tracpost.com" || host === "www.tracpost.com";

  // Root custom domain resolution — any hostname that isn't a platform
  // subdomain AND isn't TracPost's own marketing is checked against
  // blog_settings.custom_domain. Match → rewrite to /tenant/[slug]/*.
  if (subdomain === "marketing" && !isTracpostMarketing) {
    const tenantSlug = await lookupTenantByCustomDomain(host);
    if (tenantSlug) {
      const url = req.nextUrl.clone();
      url.pathname = `/tenant/${tenantSlug}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
    // Unknown hostname pointing at us — treat as misconfigured CNAME
    const url = req.nextUrl.clone();
    url.hostname = "tracpost.com";
    url.pathname = "/unauthorized";
    return NextResponse.redirect(url, 302);
  }

  if (subdomain === "blog") {
    // Blog domain — block admin/dashboard
    if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const host = hostname.split(":")[0];
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-blog-host", hostname);

    // Custom domain (e.g., blog.b2construct.com) — parse siteSlug from hostname
    const siteSlug = extractSlugFromHost(host, "blog");
    if (siteSlug) {
      // / → /tenant/b2construct/blog
      // /my-article → /tenant/b2construct/blog/my-article
      const rewritePath =
        pathname === "/"
          ? `/tenant/${siteSlug}/blog`
          : `/tenant/${siteSlug}/blog${pathname}`;
      const url = req.nextUrl.clone();
      url.pathname = rewritePath;
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }

    // Unrecognized blog domain — unauthorized hotlink or misconfigured CNAME
    const url = req.nextUrl.clone();
    url.hostname = "tracpost.com";
    url.pathname = "/unauthorized";
    return NextResponse.redirect(url, 302);
  }

  if (subdomain === "projects") {
    // Projects domain — block admin/dashboard
    if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const host = hostname.split(":")[0];

    // Custom domain (e.g., projects.b2construct.com) — parse siteSlug
    const siteSlug = extractSlugFromHost(host, "projects");
    if (siteSlug) {
      // / → /tenant/b2construct/projects
      // /kitchen-reno → /tenant/b2construct/projects/kitchen-reno
      const rewritePath =
        pathname === "/"
          ? `/tenant/${siteSlug}/projects`
          : `/tenant/${siteSlug}/projects${pathname}`;
      const url = req.nextUrl.clone();
      url.pathname = rewritePath;
      return NextResponse.rewrite(url);
    }

    // Unrecognized projects domain
    const url = req.nextUrl.clone();
    url.hostname = "tracpost.com";
    url.pathname = "/unauthorized";
    return NextResponse.redirect(url, 302);
  }

  if (subdomain === "preview") {
    // Preview — tenant content before DNS cutover, or for stakeholder
    // previews. preview.tracpost.com/b2construct/blog/my-article
    //   → /tenant/b2construct/blog/my-article
    if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Strip leading slash, take first segment as slug
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0) {
      // Bare preview.tracpost.com — bounce to marketing root
      const url = req.nextUrl.clone();
      url.hostname = "tracpost.com";
      url.pathname = "/";
      return NextResponse.redirect(url, 302);
    }

    const slug = segments[0];
    const rest = segments.slice(1).join("/");

    // Post-cutover graduation: if this tenant has an active custom
    // domain, 301 redirect preview URLs to the production domain.
    // Lets stakeholder-shared preview URLs keep working forever by
    // silently moving to the real site once DNS goes live.
    const customDomain = await lookupCustomDomainBySlug(slug);
    if (customDomain) {
      const destination = new URL(
        `https://${customDomain}${rest ? `/${rest}` : ""}`,
      );
      destination.search = req.nextUrl.search;
      return NextResponse.redirect(destination, 301);
    }

    // No custom domain yet — rewrite to the internal tenant route.
    const url = req.nextUrl.clone();
    url.pathname = rest ? `/tenant/${slug}/${rest}` : `/tenant/${slug}`;
    const res = NextResponse.rewrite(url);
    // Preview URLs must not be indexed — they advertise unreleased content
    // and would poach SEO from the real domain once it launches.
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
    return res;
  }

  if (subdomain === "studio") {
    // Block admin routes on studio subdomain
    if (pathname.startsWith("/admin")) {
      return new NextResponse("Not Found", { status: 404 });
    }
    // Static files from /public — pass through without rewriting
    if (pathname.match(/\.(js|json|xml|txt|ico|svg|png|jpg|webp|woff2?)$/)) {
      return NextResponse.next();
    }
    // /login serves the subscriber login page directly
    if (pathname === "/login") {
      return NextResponse.next();
    }
    // Already rewritten paths — don't double-rewrite
    if (pathname.startsWith("/dashboard")) {
      return NextResponse.next();
    }
    // Rewrite: /calendar → /dashboard/calendar, / → /dashboard
    const rewritePath = pathname === "/" ? "/dashboard" : `/dashboard${pathname}`;
    const url = req.nextUrl.clone();
    url.pathname = rewritePath;
    return NextResponse.rewrite(url);
  }

  if (subdomain === "platform") {
    // Block dashboard routes on platform subdomain
    if (pathname.startsWith("/dashboard")) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Admin login page — pass through
    if (pathname === "/admin-login" || pathname.startsWith("/admin-login")) {
      return NextResponse.next();
    }

    // Gate admin routes (after rewrite or direct access)
    if (pathname.startsWith("/admin")) {
      const gate = gateAdmin(req, pathname);
      if (gate) return gate;
      return NextResponse.next();
    }

    // Login rewrite — /login on platform goes to admin login
    if (pathname === "/login") {
      const url = req.nextUrl.clone();
      url.pathname = "/admin-login";
      return NextResponse.rewrite(url);
    }

    // Rewrite: /subscribers → /admin/subscribers, / → /admin
    const rewritePath = pathname === "/" ? "/admin" : `/admin${pathname}`;

    // Gate before rewriting
    const gate = gateAdmin(req, rewritePath);
    if (gate) return gate;

    const url = req.nextUrl.clone();
    url.pathname = rewritePath;
    return NextResponse.rewrite(url);
  }

  if (subdomain === "manage") {
    if (pathname.startsWith("/dashboard")) {
      return new NextResponse("Not Found", { status: 404 });
    }

    if (pathname === "/admin-login" || pathname.startsWith("/admin-login")) {
      return NextResponse.next();
    }

    if (pathname === "/login") {
      const url = req.nextUrl.clone();
      url.pathname = "/admin-login";
      return NextResponse.rewrite(url);
    }

    // Rewrite: /subscribers → /manage/subscribers, / → /manage
    const rewritePath = pathname === "/" ? "/manage" : `/manage${pathname}`;

    const gate = gateAdmin(req, rewritePath);
    if (gate) return gate;

    const url = req.nextUrl.clone();
    url.pathname = rewritePath;
    return NextResponse.rewrite(url);
  }

  // next.tracpost.com — new marketing site staging. Routes to the
  // (marketing) route group directly. Blog/projects still rewrite
  // via next.config. Block admin/dashboard.
  if (subdomain === "next") {
    if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
      return new NextResponse("Not Found", { status: 404 });
    }
    // Let the route group handle it — no rewrites needed
    return NextResponse.next();
  }

  // /login on marketing serves subscriber login
  if (pathname === "/login") {
    return NextResponse.next();
  }

  // Marketing subdomain — redirect leaked paths to proper subdomains
  if (pathname.startsWith("/dashboard")) {
    const rest = pathname.replace(/^\/dashboard/, "") || "/";
    return NextResponse.redirect(new URL(`https://studio.tracpost.com${rest}`));
  }
  if (pathname.startsWith("/admin")) {
    const rest = pathname.replace(/^\/admin/, "") || "/";
    return NextResponse.redirect(new URL(`https://platform.tracpost.com${rest}`));
  }

  // tracpost.com — marketing route group serves /, /about, /contact,
  // /pricing, /blog, /changelog, /for/*, /tools/*. No rewrites needed
  // for these — the (marketing) route group handles them directly.
  //
  // /projects still rewrites to the tenant engine (no marketing-shell
  // projects page yet). /work redirects to /pricing (marketing equiv).
  if (isTracpostMarketing) {
    if (pathname === "/work") {
      const url = req.nextUrl.clone();
      url.pathname = "/pricing";
      return NextResponse.redirect(url, 301);
    }
    if (pathname === "/projects" || pathname.startsWith("/projects/")) {
      const url = req.nextUrl.clone();
      url.pathname = `/tenant/tracpost${pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

/**
 * Gate admin routes — redirect to admin login if no tp_admin cookie.
 * Returns a redirect response if blocked, or null if allowed.
 */
function gateAdmin(req: NextRequest, pathname: string): NextResponse | null {
  // Skip API routes and login page
  if (pathname.startsWith("/api/") || pathname === "/admin-login") {
    return null;
  }

  // Only gate admin and manage routes
  if (!pathname.startsWith("/admin") && !pathname.startsWith("/manage")) {
    return null;
  }

  // Allow the admin login page within the admin path (dev mode)
  if (pathname === "/admin/login") {
    return null;
  }

  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (adminCookie === "authenticated") {
    return null;
  }

  // Redirect to admin login
  const isLocal = req.headers.get("host")?.includes("localhost");
  const loginPath = isLocal ? "/admin-login" : "/login";
  const url = req.nextUrl.clone();
  url.pathname = loginPath;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|icon\\.png).*)",
  ],
};
