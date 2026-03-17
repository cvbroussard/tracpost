"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

const baseNav = [
  { label: "Overview", path: "", icon: "◆" },
  { label: "Subscribers", path: "/subscribers", icon: "◇" },
  { label: "Pipeline", path: "/pipeline", icon: "▶" },
  { label: "Social Accounts", path: "/social", icon: "◉" },
  { label: "Content Queue", path: "/content", icon: "▤" },
  { label: "Usage & Billing", path: "/usage", icon: "◈" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "platform.tracpost.com";
  const prefix = isSubdomain ? "" : "/admin";
  const nav = baseNav.map((item) => ({
    ...item,
    href: prefix + item.path || prefix,
  }));

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center gap-2 px-5">
        <span className="text-sm font-semibold tracking-wider text-foreground">
          TRACPOST
        </span>
        <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
          ADMIN
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
          <p className="text-xs text-muted">Platform Admin</p>
          <ThemeToggle />
        </div>
        <button
          onClick={async () => {
            await fetch("/api/auth/admin", { method: "DELETE" });
            router.push(isSubdomain ? "/login" : "/admin-login");
          }}
          className="text-[10px] text-muted hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
