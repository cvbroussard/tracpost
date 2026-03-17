"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

interface TopBarProps {
  subscriberName: string;
  variant?: "studio" | "platform";
}

export function TopBar({ subscriberName, variant = "studio" }: TopBarProps) {
  const router = useRouter();

  const isSubdomain =
    typeof window !== "undefined" &&
    (window.location.hostname === "studio.tracpost.com" ||
      window.location.hostname === "platform.tracpost.com");

  async function handleLogout() {
    if (variant === "platform") {
      await fetch("/api/auth/admin", { method: "DELETE" });
      router.push(isSubdomain ? "/login" : "/admin-login");
    } else {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    }
  }

  return (
    <header className="flex h-11 shrink-0 items-center justify-between bg-black px-4">
      <div className="flex items-center gap-3">
        <img src="/icon.svg" alt="TracPost" className="h-5 w-5" />
        <span className="text-sm font-semibold tracking-wider text-white">
          TRACPOST
        </span>
        {variant === "platform" && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
            ADMIN
          </span>
        )}
      </div>
      <div className="flex items-center gap-5">
        <a
          href="https://tracpost.com/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white/50 transition-colors hover:text-white"
        >
          Docs
        </a>
        <a
          href="https://tracpost.com/support"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white/50 transition-colors hover:text-white"
        >
          Support
        </a>
        <ThemeToggle />
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/50">{subscriberName}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-white/30 transition-colors hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
