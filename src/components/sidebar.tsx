"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

const baseNav = [
  { label: "Overview", path: "", icon: "◆" },
  { label: "Brand", path: "/brand", icon: "◈" },
  { label: "Capture", path: "/capture", icon: "◎" },
  { label: "Media", path: "/media", icon: "▣" },
  { label: "Calendar", path: "/calendar", icon: "▦" },
  { label: "SEO", path: "/seo", icon: "◇" },
  { label: "Accounts", path: "/accounts", icon: "◉" },
  { label: "Settings", path: "/settings", icon: "⚙" },
];

export function Sidebar({ subscriberName }: { subscriberName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  // On studio subdomain, links are root-relative (no /dashboard prefix).
  // In dev (localhost), keep the /dashboard prefix.
  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "studio.tracpost.com";
  const prefix = isSubdomain ? "" : "/dashboard";
  const nav = baseNav.map((item) => ({
    ...item,
    href: prefix + item.path || prefix,
  }));

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center px-5">
        <span className="text-sm font-semibold tracking-wider text-foreground">
          TRACPOST
        </span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        {nav.map((item) => {
          const active =
            item.path === ""
              ? pathname === prefix || pathname === prefix + "/"
              : pathname.startsWith(prefix + item.path);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-accent-muted text-accent"
                  : "text-muted hover:bg-surface-hover hover:text-foreground"
              }`}
            >
              <span className="text-xs">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border px-5 py-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="truncate text-xs font-medium">{subscriberName}</p>
          <ThemeToggle />
        </div>
        <button
          onClick={handleLogout}
          className="text-[10px] text-muted hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
