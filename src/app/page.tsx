import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-8">
      <h1 className="text-2xl font-semibold tracking-tight">SEO Suite</h1>
      <p className="max-w-md text-center text-sm text-muted">
        SEO & Social Media Management as a Service. API-first, embeddable dashboard.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Subscriber Login
        </Link>
        <Link
          href="/admin"
          className="rounded-md border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface"
        >
          Platform Admin
        </Link>
        <Link
          href="/api/health"
          className="rounded-md border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface"
        >
          API Status
        </Link>
      </div>
    </div>
  );
}
