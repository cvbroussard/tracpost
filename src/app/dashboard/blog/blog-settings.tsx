"use client";

interface Settings {
  blog_enabled: boolean;
  subdomain: string | null;
  custom_domain: string | null;
  blog_title: string | null;
  blog_description: string | null;
}

interface BlogStatusProps {
  siteId: string;
  initialSettings: Settings;
  publishedCount: number;
  totalCount: number;
  nextArticleDate: string | null;
}

export function BlogSettings({
  siteId,
  initialSettings,
  publishedCount = 0,
  totalCount = 0,
  nextArticleDate,
}: BlogStatusProps) {
  const { blog_enabled, subdomain, custom_domain } = initialSettings;

  // Determine public URL — custom domain wins, otherwise show staging path
  const publicUrl = custom_domain
    ? `https://${custom_domain}`
    : subdomain
      ? `https://staging.tracpost.com/${subdomain}/blog`
      : null;

  if (!blog_enabled) {
    return (
      <div className="rounded-lg border border-border bg-surface p-5">
        <p className="text-sm text-muted">
          Your blog is being set up. You&apos;ll be notified when it&apos;s live.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="mb-4 flex items-center gap-3">
        <span className="rounded-full bg-success/20 px-2.5 py-0.5 text-[10px] font-medium text-success">
          Live
        </span>
        {custom_domain && (
          <span className="rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-medium text-accent">
            Custom Domain
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-baseline justify-between border-b border-border py-2">
          <span className="text-sm text-muted">Public URL</span>
          {publicUrl ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-accent hover:underline"
            >
              {publicUrl.replace("https://", "")}
            </a>
          ) : (
            <span className="text-sm text-muted">—</span>
          )}
        </div>

        <div className="flex items-baseline justify-between border-b border-border py-2">
          <span className="text-sm text-muted">Published Articles</span>
          <span className="text-sm font-medium">{publishedCount}</span>
        </div>

        <div className="flex items-baseline justify-between border-b border-border py-2">
          <span className="text-sm text-muted">Total Articles</span>
          <span className="text-sm font-medium">{totalCount}</span>
        </div>

        {nextArticleDate && (
          <div className="flex items-baseline justify-between border-b border-border py-2">
            <span className="text-sm text-muted">Next Scheduled</span>
            <span className="text-sm font-medium">{nextArticleDate}</span>
          </div>
        )}

        {!custom_domain && (
          <p className="pt-2 text-xs text-muted">
            Want your blog on your own domain? Contact us to set it up.
          </p>
        )}
      </div>
    </div>
  );
}
