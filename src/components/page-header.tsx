"use client";

import { usePathname } from "next/navigation";

interface PageHeaderProps {
  siteName: string;
  /** Optional tabs or actions for the right side */
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

export function PageHeader({ siteName, children }: PageHeaderProps) {
  const pathname = usePathname();

  // Resolve current page title from pathname
  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "studio.tracpost.com";
  const prefix = isSubdomain ? "" : "/dashboard";
  const relative = pathname.replace(prefix, "") || "";
  const pageTitle = PAGE_TITLES[relative] || relative.split("/").pop() || "Dashboard";

  return (
    <div className="flex shrink-0 items-center justify-between border-b border-border bg-surface px-5 py-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-medium text-foreground">{siteName}</span>
        <span className="text-border">/</span>
        <span className="text-muted">{pageTitle}</span>
      </div>
      {children && (
        <div className="flex items-center gap-3">
          {children}
        </div>
      )}
    </div>
  );
}
