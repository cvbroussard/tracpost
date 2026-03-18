"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface PageHeaderProps {
  siteName: string;
  siteIcon?: string;
  children?: React.ReactNode;
}

const PAGE_TITLES: Record<string, string> = {
  "": "Dashboard",
  "/brand": "Brand",
  "/capture": "Capture",
  "/media": "Media",
  "/calendar": "Calendar",
  "/seo": "SEO",
  "/accounts": "Accounts",
  "/settings": "Settings",
};

export function PageHeader({ siteName, siteIcon, children }: PageHeaderProps) {
  const pathname = usePathname();

  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "studio.tracpost.com";
  const prefix = isSubdomain ? "" : "/dashboard";
  const relative = pathname.replace(prefix, "") || "";

  // Build breadcrumb segments from path
  const segments = relative.split("/").filter(Boolean);
  const crumbs: Array<{ label: string; href: string }> = [];

  let accumulated = prefix;
  for (const seg of segments) {
    accumulated += `/${seg}`;
    const label = PAGE_TITLES[`/${seg}`] || seg.charAt(0).toUpperCase() + seg.slice(1);
    crumbs.push({ label, href: accumulated });
  }

  // Current page is the last crumb (or Dashboard if at root)
  const currentPage = crumbs.length > 0 ? crumbs.pop()! : null;

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-5 py-3">
      <div className="flex items-center gap-2 text-sm">
        {/* Business brand — plain logo, no link */}
        {siteIcon ? (
          <img src={siteIcon} alt={siteName} className="h-5 w-5 rounded" />
        ) : (
          <img src="/icon.svg" alt={siteName} className="h-5 w-5" />
        )}
        <span className="font-medium text-foreground">{siteName}</span>

        {/* Breadcrumbs — root is always Dashboard */}
        <span className="text-dim">/</span>
        {crumbs.length === 0 && !currentPage ? (
          <span className="text-muted">Dashboard</span>
        ) : (
          <>
            <Link href={prefix || "/"} className="text-muted hover:text-foreground">
              Dashboard
            </Link>
            {crumbs.map((crumb) => (
              <span key={crumb.href} className="flex items-center gap-2">
                <span className="text-dim">/</span>
                <Link href={crumb.href} className="text-muted hover:text-foreground">
                  {crumb.label}
                </Link>
              </span>
            ))}
            {currentPage && (
              <>
                <span className="text-dim">/</span>
                <span className="text-muted">{currentPage.label}</span>
              </>
            )}
          </>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-3">
          {children}
        </div>
      )}
    </div>
  );
}
