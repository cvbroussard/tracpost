import "server-only";
import { sql } from "@/lib/db";

/**
 * Infrastructure milestone status computation.
 *
 * Per the three-milestone architecture ([[three-milestones-architecture]]),
 * Infrastructure is a preparatory milestone with a readiness-measurement
 * pipeline view. Unlike Branding (12-step chain with inter-dependencies
 * persisted in `provisioning_tasks`), Infrastructure is a flat checklist:
 * each card reads its own current-state signals on-the-fly. No
 * `infrastructure_tasks` table — the underlying data IS the source of
 * truth, and recompute is stateless.
 *
 * The 5 cards mirror the surviving Infrastructure detail surfaces.
 * Each card has sub_tasks that map to specific readiness conditions a
 * downstream consumer would check.
 */

export type SubTaskStatus = "complete" | "pending" | "not_applicable";

export interface InfraSubTask {
  key: string;
  label: string;
  status: SubTaskStatus;
  /** Optional value to show alongside the status, e.g. asset name. */
  detail?: string;
}

export interface InfraCard {
  key: "subscription" | "connections" | "gbp" | "website" | "search_console";
  title: string;
  /** Detail surface for the operator to click through to. */
  href: string;
  /** "complete" iff every required sub_task is complete (n/a counts as complete). */
  status: "complete" | "incomplete";
  /** Per-card counts shown in the card header. */
  completeCount: number;
  totalCount: number;
  subTasks: InfraSubTask[];
}

export interface InfrastructureStatus {
  cards: InfraCard[];
  /** Across-cards summary: total sub_tasks complete vs total required. */
  totals: { complete: number; total: number };
}

const ALL_PLATFORMS = [
  "facebook",
  "instagram",
  "gbp",
  "linkedin",
  "youtube",
  "tiktok",
  "twitter",
  "pinterest",
] as const;

const PLATFORM_LABEL: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  gbp: "Google Business Profile",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  tiktok: "TikTok",
  twitter: "X (Twitter)",
  pinterest: "Pinterest",
};

const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

function rollup(subTasks: InfraSubTask[]): { complete: number; total: number; status: "complete" | "incomplete" } {
  const required = subTasks.filter((s) => s.status !== "not_applicable");
  const complete = required.filter((s) => s.status === "complete").length;
  const total = required.length;
  return {
    complete,
    total,
    status: total > 0 && complete === total ? "complete" : "incomplete",
  };
}

function buildCard(
  key: InfraCard["key"],
  title: string,
  href: string,
  subTasks: InfraSubTask[],
): InfraCard {
  const r = rollup(subTasks);
  return {
    key,
    title,
    href,
    status: r.status,
    completeCount: r.complete,
    totalCount: r.total,
    subTasks,
  };
}

/**
 * Compute Infrastructure milestone status for one business + its
 * subscription. Stateless — reads current signals only.
 */
export async function computeInfrastructureStatus(args: {
  businessId: string;
  subscriberId: string;
}): Promise<InfrastructureStatus> {
  const { businessId, subscriberId } = args;

  // ── Subscription card ──
  // Reads accounts.is_active + accounts.plan. (Stripe-level invoice status
  // is a future refinement when we wire deeper billing observability.)
  const [account] = await sql`
    SELECT plan, is_active FROM accounts WHERE id = ${subscriberId} LIMIT 1
  `;
  const planSet = nonEmpty(account?.plan);
  const planActive = Boolean(account?.is_active);
  const subscriptionCard = buildCard("subscription", "Subscription", "/ops/billing", [
    {
      key: "plan_selected",
      label: "Plan selected",
      status: planSet ? "complete" : "pending",
      detail: planSet ? (account?.plan as string) : undefined,
    },
    {
      key: "account_active",
      label: "Account active",
      status: planActive ? "complete" : "pending",
    },
  ]);

  // ── Connections card ──
  // One sub_task per platform. "complete" iff the business has a primary
  // platform_assets row of that platform.
  const platformRows = await sql`
    SELECT DISTINCT pa.platform
    FROM business_platform_assets bpa
    JOIN platform_assets pa ON pa.id = bpa.platform_asset_id
    WHERE bpa.business_id = ${businessId} AND bpa.is_primary = true
  `;
  const connectedPlatforms = new Set<string>(platformRows.map((r) => r.platform as string));
  const connectionsCard = buildCard(
    "connections",
    "Connections",
    "/ops/connections",
    ALL_PLATFORMS.map((p) => ({
      key: p,
      label: PLATFORM_LABEL[p] || p,
      status: connectedPlatforms.has(p) ? "complete" : "pending",
    })),
  );

  // ── Google Business Profile card ──
  // Sub-tasks: OAuth (gbp in connections), categories declared (with primary),
  // profile fields populated (title + address.lines + hours).
  const gbpOauthConnected = connectedPlatforms.has("gbp");
  const [catRow] = await sql`
    SELECT COUNT(*) FILTER (WHERE is_primary = true)::int AS primary_count,
           COUNT(*)::int AS total_count
    FROM business_gbp_categories WHERE business_id = ${businessId}
  `.catch(() => [{ primary_count: 0, total_count: 0 }]);
  const categoriesPrimarySet = (catRow?.primary_count as number) > 0;
  const categoriesAdditionalCount = Math.max(
    0,
    (catRow?.total_count as number) - (catRow?.primary_count as number),
  );

  const [biz] = await sql`
    SELECT gbp_profile FROM businesses WHERE id = ${businessId} LIMIT 1
  `;
  const gbpProfile = (biz?.gbp_profile as Record<string, unknown> | null) ?? {};
  const profileTitle = nonEmpty(gbpProfile.title);
  const profileAddress = (() => {
    const addr = gbpProfile.address as Record<string, unknown> | undefined;
    const lines = (addr?.addressLines as string[] | undefined) ?? [];
    return lines.some((l) => nonEmpty(l));
  })();
  const profileHours = Array.isArray(gbpProfile.regularHours) && (gbpProfile.regularHours as unknown[]).length > 0;
  const profileFieldsComplete = profileTitle && profileAddress && profileHours;

  const gbpCard = buildCard("gbp", "Google Business Profile", "/ops/gbp", [
    {
      key: "oauth_connected",
      label: "OAuth connected",
      status: gbpOauthConnected ? "complete" : "pending",
    },
    {
      key: "primary_category",
      label: "Primary category",
      status: categoriesPrimarySet ? "complete" : "pending",
      detail: categoriesAdditionalCount > 0 ? `+${categoriesAdditionalCount} additional` : undefined,
    },
    {
      key: "profile_fields",
      label: "Profile fields (title · address · hours)",
      status: profileFieldsComplete ? "complete" : "pending",
    },
  ]);

  // ── Website card ──
  // Hosting-fork applies. external_hosted → entire card collapses to a
  // single "external_hosted" sub_task marked complete (not applicable to
  // TracPost-side provisioning).
  const [siteRow] = await sql`
    SELECT s.hosting_model, s.page_config, s.work_content,
           (s.website_copy IS NOT NULL) AS has_website_copy,
           bs.custom_domain
    FROM businesses s
    LEFT JOIN blog_settings bs ON bs.business_id = s.id
    WHERE s.id = ${businessId} LIMIT 1
  `;
  const hostingModel = siteRow?.hosting_model as string | null | undefined;
  let websiteCard: InfraCard;
  if (hostingModel === "external_hosted") {
    websiteCard = buildCard("website", "Website", "/ops/website", [
      {
        key: "hosting_model_external",
        label: "External hosting — content feed only",
        status: "complete",
      },
    ]);
  } else {
    const customDomainSet = nonEmpty(siteRow?.custom_domain);
    const pageConfigPopulated =
      Array.isArray(siteRow?.page_config) && (siteRow!.page_config as unknown[]).length > 0;
    const hasWebsiteCopy = Boolean(siteRow?.has_website_copy);
    const workContentObj = siteRow?.work_content as Record<string, unknown> | null;
    const workContentPopulated =
      workContentObj !== null && workContentObj !== undefined && Object.keys(workContentObj).length > 0;
    const hostingDeclared = nonEmpty(hostingModel);
    websiteCard = buildCard("website", "Website", "/ops/website", [
      {
        key: "hosting_model_declared",
        label: "Hosting model declared",
        status: hostingDeclared ? "complete" : "pending",
        detail: hostingDeclared ? (hostingModel as string) : undefined,
      },
      {
        key: "custom_domain",
        label: "Custom domain",
        status: customDomainSet ? "complete" : "pending",
        detail: customDomainSet ? (siteRow?.custom_domain as string) : undefined,
      },
      {
        key: "page_config",
        label: "Page config",
        status: pageConfigPopulated ? "complete" : "pending",
      },
      {
        key: "website_copy",
        label: "Website copy",
        status: hasWebsiteCopy ? "complete" : "pending",
      },
      {
        key: "work_content",
        label: "Work content",
        status: workContentPopulated ? "complete" : "pending",
      },
    ]);
  }

  // ── Search Console card ──
  const [seoRow] = await sql`
    SELECT gsc_property FROM businesses WHERE id = ${businessId} LIMIT 1
  `;
  const gscVerified = nonEmpty(seoRow?.gsc_property);
  const searchConsoleCard = buildCard(
    "search_console",
    "Search Console",
    "/ops/seo",
    [
      {
        key: "gsc_verified",
        label: "Property verified",
        status: gscVerified ? "complete" : "pending",
        detail: gscVerified ? (seoRow?.gsc_property as string) : undefined,
      },
    ],
  );

  const cards = [subscriptionCard, connectionsCard, gbpCard, websiteCard, searchConsoleCard];
  const totals = cards.reduce(
    (acc, c) => ({ complete: acc.complete + c.completeCount, total: acc.total + c.totalCount }),
    { complete: 0, total: 0 },
  );

  return { cards, totals };
}
