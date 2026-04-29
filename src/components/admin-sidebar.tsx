"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const baseNav = [
  { label: "Overview", path: "", icon: "◆" },
  { label: "Onboarding Queue", path: "/onboarding-queue", icon: "▤" },
  { label: "Test Subscriptions", path: "/test-subscriptions", icon: "✕" },
  { label: "Provisioning", path: "/provisioning", icon: "▸" },
  { label: "Site Controls", path: "/sites", icon: "◎" },
  { label: "Subscribers", path: "/subscribers", icon: "◇" },
  { label: "Pipeline", path: "/pipeline", icon: "▶" },
  { label: "Connections", path: "/social", icon: "◉" },
  { label: "Google", path: "/google/location-picker", icon: "G" },
  { label: "Content Queue", path: "/content", icon: "▤" },
  { label: "Products", path: "/products", icon: "◆" },
  { label: "SEO", path: "/seo", icon: "◇" },
  { label: "Usage & Billing", path: "/usage", icon: "◈" },
  { label: "Logs", path: "/logs", icon: "▧" },
];

export function AdminSidebar() {
  const pathname = usePathname();

  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "platform.tracpost.com";
  const prefix = isSubdomain ? "" : "/admin";
  const nav = baseNav.map((item) => ({
    ...item,
    href: prefix + item.path || "/",
  }));

  return (
    <aside className="flex h-full w-48 flex-col border-r border-border bg-surface">
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3">
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
    </aside>
  );
}
