"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./theme-toggle";

interface TopBarProps {
  userName: string;
  variant?: "studio" | "platform" | "manage";
}

export function TopBar({ userName, variant = "studio" }: TopBarProps) {
  const router = useRouter();

  const isSubdomain =
    typeof window !== "undefined" &&
    (window.location.hostname === "studio.tracpost.com" ||
      window.location.hostname === "platform.tracpost.com" ||
      window.location.hostname === "manage.tracpost.com");

  async function handleLogout() {
    if (variant === "platform" || variant === "manage") {
      await fetch("/api/auth/admin", { method: "DELETE" });
      router.push(isSubdomain ? "/login" : "/admin-login");
    } else {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    }
  }

  return (
    <header className="flex h-13 shrink-0 items-center justify-between bg-black px-5">
      <div className="flex items-center gap-3">
        <img src="/icon-dark.svg" alt="TracPost" className="h-6 w-6" />
        <span className="font-semibold tracking-wider text-white">
          TRACPOST
        </span>
        {variant === "platform" && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
            PLATFORM
          </span>
        )}
        {variant === "manage" && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
            MANAGE
          </span>
        )}
      </div>
      <div className="flex items-center gap-5">
        <a
          href="https://tracpost.com/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-white/50 transition-colors hover:text-white"
        >
          Docs
        </a>
        <a
          href="https://tracpost.com/support"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-white/50 transition-colors hover:text-white"
        >
          Support
        </a>
        <ThemeToggle />
        <div className="flex items-center gap-2">
          <span className="text-sm text-white/50">{userName}</span>
          <button
            onClick={handleLogout}
            className="text-sm text-white/30 transition-colors hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
