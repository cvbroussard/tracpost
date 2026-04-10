import { NextRequest, NextResponse } from "next/server";
import { classifyHost } from "@/lib/subdomains";

/**
 * Custom domain → siteSlug map.
 * When a tenant provisions a custom blog domain (e.g., blog.b2construct.com),
 * add it here so middleware can rewrite to /blog/[siteSlug]/[path].
 * Env var: CUSTOM_DOMAIN_MAP={"blog.b2construct.com":"b2construct"}
 */
const customDomainMap: Record<string, string> = (() => {
  try {
    return JSON.parse(process.env.CUSTOM_DOMAIN_MAP || "{}");
  } catch {
    return {};
  }
})();

/**
 * Subdomain-based routing middleware.
 *
 * Production:
 *   studio.tracpost.com/calendar     → rewrites to /dashboard/calendar
 *   platform.tracpost.com/subscribers → rewrites to /admin/subscribers
 *   tracpost.com/blog/[site]/[slug]  → public blog (no rewrite needed)
 *   blog.b2construct.com/my-article  → rewrites to /blog/b2construct/my-article
 *
 * Development (localhost):
 *   No rewriting — access /dashboard/* and /admin/* directly.
 */
export function middleware(req: NextRequest) {
  const hostname = req.headers.get("host") || "localhost";
  const subdomain = classifyHost(hostname);
  const { pathname } = req.nextUrl;

  const isLocal = hostname.includes("localhost");

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

  if (subdomain === "blog") {
    // Blog domain — block admin/dashboard
    if (pathname.startsWith("/admin") || pathname.startsWith("/dashboard")) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const host = hostname.split(":")[0];
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-blog-host", hostname);

    // Custom domain (e.g., blog.b2construct.com) — map to siteSlug, rewrite paths
    const siteSlug = customDomainMap[host];
    if (siteSlug) {
      // Already on /blog path — pass through
      if (pathname.startsWith("/blog")) {
        return NextResponse.next({ request: { headers: requestHeaders } });
      }
      // / → /blog/b2construct, /my-article → /blog/b2construct/my-article
      const rewritePath = pathname === "/" ? `/blog/${siteSlug}` : `/blog/${siteSlug}${pathname}`;
      const url = req.nextUrl.clone();
      url.pathname = rewritePath;
      return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
    }

    // blog.tracpost.com — discovery hub
    if (host === "blog.tracpost.com") {
      if (pathname.startsWith("/blog")) {
        return NextResponse.next({ request: { headers: requestHeaders } });
      }
      const rewritePath = pathname === "/" ? "/blog" : `/blog${pathname}`;
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

  // Only gate admin routes
  if (!pathname.startsWith("/admin")) {
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
