import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { TopBar } from "@/components/topbar";
import { PageHeader } from "@/components/page-header";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { OnboardingChecklist, type ChecklistState } from "@/components/onboarding-checklist";

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
      sql`SELECT brand_playbook IS NOT NULL AS has_playbook, autopilot_enabled FROM sites WHERE id = ${siteId}`,
      sql`SELECT COUNT(*)::int AS count FROM media_assets WHERE site_id = ${siteId}`,
      sql`SELECT blog_enabled FROM blog_settings WHERE site_id = ${siteId}`,
    ]);

    const connectedPlatforms = accounts.map((a: Record<string, unknown>) => a.platform as string);
    const hasPlaybook = siteData[0]?.has_playbook === true;
    const autopilotActive = siteData[0]?.autopilot_enabled === true;
    const blogEnabled = blogData[0]?.blog_enabled === true;

    checklistState = {
      connectedPlatforms,
      allPlatforms: ALL_PLATFORMS,
      hasPlaybook,
      assetCount: assetCount[0]?.count || 0,
      blogEnabled,
      autopilotActive,
    };
  }

  // Determine if checklist should show
  // Gates: 3+ platforms, 5+ assets, blog enabled, autopilot active
  // Playbook is auto-generated — not a subscriber gate
  const setupComplete = checklistState
    ? checklistState.connectedPlatforms.length >= 3
      && checklistState.assetCount >= 5
      && checklistState.blogEnabled
      && checklistState.autopilotActive
    : false;

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
        {/* Right aside: onboarding checklist */}
        {checklistState && !setupComplete && (
          <div className="hidden lg:block">
            <OnboardingChecklist state={checklistState} prefix={prefix} />
          </div>
        )}
      </div>
    </div>
  );
}
