"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const baseNav = [
  { label: "Overview", path: "", icon: "◆" },
  { label: "Capture", path: "/capture", icon: "◎" },
  { label: "Media", path: "/media", icon: "▣" },
  { label: "Calendar", path: "/calendar", icon: "▦" },
  { label: "Accounts", path: "/accounts", icon: "◉" },
  { label: "Settings", path: "/settings", icon: "⚙" },
];

export function MobileNav({ subscriberName }: { subscriberName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "studio.tracpost.com";
  const prefix = isSubdomain ? "" : "/dashboard";

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="md:hidden">
      {/* Top bar */}
      <div className="flex h-12 items-center justify-between border-b border-border bg-surface px-4">
        <span className="text-sm font-semibold tracking-wider text-foreground">
          TRACPOST
        </span>
        <button
          onClick={() => setOpen(!open)}
          className="flex h-8 w-8 items-center justify-center rounded text-foreground"
          aria-label="Menu"
        >
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* Dropdown menu */}
      {open && (
        <nav className="border-b border-border bg-surface px-2 py-2">
          {baseNav.map((item) => {
            const href = prefix + item.path || prefix;
            const active =
              item.path === ""
                ? pathname === prefix || pathname === prefix + "/"
                : pathname.startsWith(prefix + item.path);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-muted hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                <span className="text-xs">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
          <div className="mt-1 border-t border-border px-3 pt-2">
            <p className="mb-1 truncate text-xs font-medium">{subscriberName}</p>
            <button
              onClick={handleLogout}
              className="text-[10px] text-muted hover:text-foreground"
            >
              Sign out
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
