import { NextRequest, NextResponse } from "next/server";
import { classifyHost } from "@/lib/subdomains";

/**
 * Subdomain-based routing middleware.
 *
 * Production:
 *   studio.tracpost.com/calendar   → rewrites to /dashboard/calendar
 *   platform.tracpost.com/subscribers → rewrites to /admin/subscribers
 *   tracpost.com/*                  → serves public pages, blocks /dashboard and /admin
 *
 * Development (localhost):
 *   No rewriting — access /dashboard/* and /admin/* directly.
 */
export function middleware(req: NextRequest) {
  const hostname = req.headers.get("host") || "localhost";
  const subdomain = classifyHost(hostname);
  const { pathname } = req.nextUrl;

  // In development, skip all subdomain logic
  if (subdomain === "marketing" && hostname.includes("localhost")) {
    return NextResponse.next();
  }

  // API routes — shared across all subdomains, pass through
  if (pathname.startsWith("/api/") || pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Static/shared public pages — accessible from all subdomains
  const sharedPaths = ["/login", "/privacy", "/terms", "/data-deletion"];
  if (sharedPaths.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  if (subdomain === "studio") {
    // Block admin routes on studio subdomain
    if (pathname.startsWith("/admin")) {
      return new NextResponse("Not Found", { status: 404 });
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
    // Already rewritten paths
    if (pathname.startsWith("/admin")) {
      return NextResponse.next();
    }
    // Rewrite: /subscribers → /admin/subscribers, / → /admin
    const rewritePath = pathname === "/" ? "/admin" : `/admin${pathname}`;
    const url = req.nextUrl.clone();
    url.pathname = rewritePath;
    return NextResponse.rewrite(url);
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

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|icon\\.png).*)",
  ],
};
