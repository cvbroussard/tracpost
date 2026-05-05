"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Props {
  connected: boolean;
  accountName: string | null;
  accountStatus: string | null;
  reviews: {
    total: number;
    needsReply: number;
    draftReady: number;
    replied: number;
    avgRating: number;
    recent: number;
  };
  posts: {
    total: number;
    published: number;
    recent: number;
  };
}

function Card({
  title,
  href,
  children,
  actionLabel,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
  actionLabel?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <Link href={href} className="text-xs text-accent hover:text-accent/80">
          {actionLabel || "View"}
        </Link>
      </div>
      {children}
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted">{sub}</p>}
    </div>
  );
}

export function GoogleOverviewClient({ connected, accountName, accountStatus, reviews, posts }: Props) {
  const pathname = usePathname();
  const isSubdomain =
    typeof window !== "undefined" &&
    window.location.hostname === "studio.tracpost.com";
  const prefix = isSubdomain ? "" : "/dashboard";

  if (!connected) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <p className="text-4xl mb-4">G</p>
          <h2 className="text-lg font-medium mb-2">Connect Google Business Profile</h2>
          <p className="text-sm text-muted mb-4">
            Link your Google Business Profile to manage reviews, posts, and performance from one place.
          </p>
          <Link
            href={prefix + "/integrations"}
            className="inline-block rounded bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90"
          >
            Connect GBP
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Connection status */}
      <div className="mb-4 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${accountStatus === "active" ? "bg-success" : "bg-warning"}`} />
        <span className="text-sm">{accountName}</span>
        <span className="text-xs text-muted">
          {accountStatus === "active" ? "Connected" : accountStatus}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Reviews */}
        <Card title="Reviews" href={prefix + "/google/reviews"} actionLabel="Manage">
          <div className="grid grid-cols-3 gap-4">
            <Metric
              label="Average"
              value={reviews.avgRating ? `${reviews.avgRating}★` : "—"}
              sub={`${reviews.total} total`}
            />
            <Metric
              label="Needs Reply"
              value={reviews.needsReply + reviews.draftReady}
              sub={reviews.draftReady > 0 ? `${reviews.draftReady} drafts ready` : undefined}
            />
            <Metric
              label="Last 30 days"
              value={reviews.recent}
            />
          </div>
        </Card>

        {/* Posts */}
        <Card title="Posts" href={prefix + "/unipost"}>
          <div className="grid grid-cols-3 gap-4">
            <Metric label="Published" value={posts.published} />
            <Metric label="Last 30 days" value={posts.recent} />
            <Metric label="Total" value={posts.total} />
          </div>
        </Card>

        {/* Performance */}
        <Card title="Performance" href={prefix + "/google/performance"}>
          <div className="py-4 text-center">
            <p className="text-sm text-muted">Search impressions, map views, calls</p>
            <p className="mt-1 text-xs text-muted">Coming soon</p>
          </div>
        </Card>

        {/* Profile */}
        <Card title="Profile" href={prefix + "/google/profile"}>
          <div className="py-4 text-center">
            <p className="text-sm text-muted">Hours, categories, description</p>
            <p className="mt-1 text-xs text-muted">Coming soon</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
