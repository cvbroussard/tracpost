"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { label: "Overview", href: "/admin", icon: "◆" },
  { label: "Subscribers", href: "/admin/subscribers", icon: "◇" },
  { label: "Pipeline", href: "/admin/pipeline", icon: "▶" },
  { label: "Social Accounts", href: "/admin/social", icon: "◉" },
  { label: "Content Queue", href: "/admin/content", icon: "▤" },
  { label: "Usage & Billing", href: "/admin/usage", icon: "◈" },
];

export function AdminSidebar() {
  const pathname = usePathname();

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
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
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
      </nav>
      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted">Platform Admin</p>
      </div>
    </aside>
  );
}
