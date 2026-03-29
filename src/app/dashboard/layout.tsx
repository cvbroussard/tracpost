import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { OnboardingChecklist, type ChecklistState } from "@/components/onboarding-checklist";
import { ActivityFeed } from "@/components/activity-feed";
import { ContextualHelp } from "@/components/contextual-help";

const ALL_PLATFORMS = [
  "instagram", "tiktok", "facebook", "gbp",
  "youtube", "twitter", "linkedin", "pinterest",
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const activeSite = session.sites.find((s) => s.id === session.activeSiteId) || session.sites[0];
  const siteId = activeSite?.id;

  // Load onboarding state
  let checklistState: ChecklistState | null = null;

  if (siteId) {
    const [accounts, siteData, assetCount, blogData] = await Promise.all([
      sql`
        SELECT DISTINCT sa.platform
        FROM social_accounts sa
        JOIN site_social_links ssl ON ssl.social_account_id = sa.id
        WHERE ssl.site_id = ${siteId} AND sa.status = 'active'
      `,
      sql`
        SELECT brand_playbook IS NOT NULL AS has_playbook, autopilot_enabled,
               provisioning_status, metadata, brand_voice
        FROM sites WHERE id = ${siteId}
      `,
      sql`SELECT COUNT(*)::int AS count FROM media_assets WHERE site_id = ${siteId}`,
      sql`SELECT blog_enabled FROM blog_settings WHERE site_id = ${siteId}`,
    ]);

    const connectedPlatforms = accounts.map((a: Record<string, unknown>) => a.platform as string);
    const hasPlaybook = siteData[0]?.has_playbook === true;
    const autopilotActive = siteData[0]?.autopilot_enabled === true;
    const blogEnabled = blogData[0]?.blog_enabled === true;
    const provisioningStatus = (siteData[0]?.provisioning_status as string) || null;
    const siteMeta = (siteData[0]?.metadata || {}) as Record<string, unknown>;
    const existingAccounts = (siteMeta.existing_accounts || []) as string[];
    const brandVoice = (siteData[0]?.brand_voice || {}) as Record<string, unknown>;
    const isPlaybookRefined = !!brandVoice._subscriberAngle;

    checklistState = {
      connectedPlatforms,
      allPlatforms: ALL_PLATFORMS,
      existingAccounts,
      hasPlaybook,
      isPlaybookRefined,
      assetCount: assetCount[0]?.count || 0,
      blogEnabled,
      autopilotActive,
      provisioningStatus,
    };
  }

  // Checklist hides when provisioning is complete and all subscriber steps done
  const setupComplete = checklistState
    ? checklistState.provisioningStatus === "complete"
      && checklistState.existingAccounts.every((p) => checklistState!.connectedPlatforms.includes(p))
      && checklistState.assetCount >= 5
      && checklistState.blogEnabled
      && checklistState.autopilotActive
    : false;

  // Activity feed data
  const activityItems = siteId ? await buildActivityFeed(siteId) : [];

  const isSubdomain =
    typeof globalThis !== "undefined" && "location" in globalThis
      ? false // server-side, can't check
      : false;
  const prefix = "/dashboard"; // Layout always uses /dashboard prefix; sidebar handles subdomain rewriting

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="hidden md:block">
        <TopBar subscriberName={session.subscriberName} />
        <PageHeader siteName={activeSite?.name || "TracPost"} />
      </div>
      <MobileNav subscriberName={session.subscriberName} />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden md:block">
          <Sidebar
            subscriberName={session.subscriberName}
            sites={session.sites}
            activeSiteId={session.activeSiteId}
          />
        </div>
        <main className="flex-1 overflow-y-auto p-4 md:p-8">{children}</main>
        {/* Right aside — always visible */}
        {checklistState && (
          <div className="hidden lg:block">
            <div className="flex h-full w-72 flex-col border-l border-border bg-surface">
              <OnboardingChecklist state={checklistState} prefix={prefix} defaultCollapsed={setupComplete} />
              <ActivityFeed items={activityItems} />
              <ContextualHelp />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

async function buildActivityFeed(siteId: string) {
  const items: Array<{
    id: string;
    type: "published" | "scheduled" | "triaged" | "blog" | "review" | "caption" | "pipeline";
    message: string;
    detail?: string;
    timestamp: string;
  }> = [];

  // Recent published posts
  const published = await sql`
    SELECT sp.id, sa.platform, sp.caption, sp.published_at
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sp.status = 'published' AND sp.published_at IS NOT NULL
    ORDER BY sp.published_at DESC
    LIMIT 10
  `;
  for (const p of published) {
    items.push({
      id: `pub-${p.id}`,
      type: "published",
      message: `Published to ${p.platform}`,
      detail: p.caption ? String(p.caption).slice(0, 80) : undefined,
      timestamp: p.published_at as string,
    });
  }

  // Upcoming scheduled posts
  const scheduled = await sql`
    SELECT sp.id, sa.platform, sp.scheduled_at
    FROM social_posts sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sp.status = 'scheduled' AND sp.scheduled_at > NOW()
    ORDER BY sp.scheduled_at ASC
    LIMIT 5
  `;
  for (const s of scheduled) {
    items.push({
      id: `sched-${s.id}`,
      type: "scheduled",
      message: `Scheduled for ${s.platform}`,
      detail: new Date(s.scheduled_at as string).toLocaleString("en-US", {
        weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      }),
      timestamp: s.scheduled_at as string,
    });
  }

  // Recently triaged assets
  const triaged = await sql`
    SELECT id, context_note, triaged_at
    FROM media_assets
    WHERE site_id = ${siteId} AND triage_status IN ('shelved', 'ready') AND triaged_at IS NOT NULL
    ORDER BY triaged_at DESC
    LIMIT 5
  `;
  for (const t of triaged) {
    items.push({
      id: `tri-${t.id}`,
      type: "triaged",
      message: "Asset triaged and ready",
      detail: t.context_note ? String(t.context_note).slice(0, 80) : undefined,
      timestamp: t.triaged_at as string,
    });
  }

  // Recent blog posts
  const blogs = await sql`
    SELECT id, title, published_at, created_at
    FROM blog_posts
    WHERE site_id = ${siteId} AND status = 'published'
    ORDER BY published_at DESC
    LIMIT 3
  `;
  for (const b of blogs) {
    items.push({
      id: `blog-${b.id}`,
      type: "blog",
      message: "Blog post published",
      detail: b.title ? String(b.title) : undefined,
      timestamp: (b.published_at || b.created_at) as string,
    });
  }

  // Recent reviews
  const reviews = await sql`
    SELECT id, platform, reviewer_name, rating, created_at
    FROM inbox_reviews
    WHERE site_id = ${siteId}
    ORDER BY created_at DESC
    LIMIT 5
  `;
  for (const r of reviews) {
    items.push({
      id: `rev-${r.id}`,
      type: "review",
      message: `New ${r.rating}★ review on ${r.platform}`,
      detail: r.reviewer_name ? String(r.reviewer_name) : undefined,
      timestamp: r.created_at as string,
    });
  }

  // Sort all by timestamp descending
  items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  return items.slice(0, 30);
}
