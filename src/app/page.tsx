import Link from "next/link";
import { studioUrl, platformUrl } from "@/lib/subdomains";

export default function Home() {
  const loginHref = studioUrl("/login");
  const adminHref = platformUrl("");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-8">
      <h1 className="text-2xl font-semibold tracking-tight">TracPost</h1>
      <p className="max-w-md text-center text-sm text-muted">
        Social content automation for businesses. API-first, embeddable dashboard.
      </p>
      <div className="flex gap-3">
        <Link
          href={loginHref}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Subscriber Login
        </Link>
        <Link
          href={adminHref}
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface"
        >
          Platform Admin
        </Link>
        <Link
          href="/api/health"
          className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface"
        >
          API Status
        </Link>
      </div>
    </div>
  );
}
