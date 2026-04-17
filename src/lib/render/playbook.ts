/**
 * Platform playbook — the decision engine. Takes content signals +
 * tenant signals + connected platforms, outputs a RenderPlan per
 * platform. Phase 1: static rules engine.
 *
 * The playbook is the WHY. The render matrix is the WHAT.
 */
import "server-only";
import { sql } from "@/lib/db";
import type {
  RenderPlan,
  PlatformKey,
  RenderConfig,
  GradePreset,
  TextOverlay,
  PLATFORM_ASPECTS,
} from "./types";
import { PLATFORM_ASPECTS as ASPECTS } from "./types";

interface ContentSignals {
  qualityScore: number | null;
  sceneType: string | null;
  projectId: string | null;
  isProjectHero: boolean;
  mediaType: string;
}

interface TenantSignals {
  businessType: string | null;
  renderConfig: RenderConfig;
  tier: "growth" | "authority" | "enterprise";
  connectedPlatforms: PlatformKey[];
}

/**
 * Generate render plans for all connected platforms.
 */
export function generateRenderPlans(
  content: ContentSignals,
  tenant: TenantSignals,
): RenderPlan[] {
  const plans: RenderPlan[] = [];

  for (const platform of tenant.connectedPlatforms) {
    const plan = planForPlatform(platform, content, tenant);
    if (plan) plans.push(plan);
  }

  // Always render a blog variant
  if (!tenant.connectedPlatforms.includes("blog")) {
    const blogPlan = planForPlatform("blog", content, tenant);
    if (blogPlan) plans.push(blogPlan);
  }

  return plans;
}

function planForPlatform(
  platform: PlatformKey,
  content: ContentSignals,
  tenant: TenantSignals,
): RenderPlan | null {
  // Skip video-only platforms for image assets (for now)
  if (content.mediaType?.startsWith("video") && platform !== "tiktok" && platform !== "youtube") {
    return null;
  }

  const crop = ASPECTS[platform];
  const grade = resolveGrade(tenant.renderConfig, platform);
  const textOverlays = resolveOverlays(platform, content, tenant);
  const watermark = resolveWatermark(platform, tenant);

  return {
    platform,
    crop,
    grade,
    textOverlays,
    watermark,
    watermarkPosition: tenant.renderConfig.watermark_position || "bottom-right",
  };
}

function resolveGrade(config: RenderConfig, platform: PlatformKey): GradePreset {
  // Tenant preference wins if set
  if (config.grade_warmth && config.grade_warmth !== "auto") {
    return config.grade_warmth;
  }

  // Platform-specific defaults
  const platformGrades: Partial<Record<PlatformKey, GradePreset>> = {
    instagram: "warm_bright",
    instagram_story: "warm_bright",
    tiktok: "warm_bright",
    pinterest: "warm_bright",
    facebook: "warm_natural",
    linkedin: "clean_natural",
    gbp: "clean_natural",
    youtube: "warm_natural",
    blog: "warm_natural",
  };

  return platformGrades[platform] || "auto";
}

function resolveOverlays(
  platform: PlatformKey,
  content: ContentSignals,
  tenant: TenantSignals,
): TextOverlay[] {
  const overlays: TextOverlay[] = [];

  // Pinterest always gets a headline overlay (algorithm preference)
  if (platform === "pinterest" && content.sceneType) {
    overlays.push({
      text: formatSceneHeadline(content.sceneType),
      position: "bottom-center",
      fontSize: 36,
      fontWeight: "bold",
      color: "#ffffff",
      backgroundColor: "rgba(0,0,0,0.6)",
    });
  }

  // CTA overlay for Instagram and Facebook (Authority+ only)
  if (
    (platform === "instagram" || platform === "facebook") &&
    (tenant.tier === "authority" || tenant.tier === "enterprise")
  ) {
    const ctaText = tenant.renderConfig.cta_defaults?.[platform];
    if (ctaText) {
      overlays.push({
        text: ctaText,
        position: "bottom-right",
        fontSize: 20,
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.5)",
      });
    }
  }

  // Stat overlay for project heroes (Authority+ only)
  if (
    content.isProjectHero &&
    content.projectId &&
    (tenant.tier === "authority" || tenant.tier === "enterprise")
  ) {
    // Stat overlay is applied post-render in the engine via
    // applyStatOverlay() since it needs async DB lookup. We signal
    // intent here with a marker overlay that the engine intercepts.
    overlays.push({
      text: "__STAT_OVERLAY__",
      position: "bottom-left",
      fontSize: 0,
    });
  }

  return overlays;
}

function resolveWatermark(platform: PlatformKey, tenant: TenantSignals): boolean {
  if (!tenant.renderConfig.watermark_enabled) return false;
  // Skip watermark on stories (too prominent) and GBP (not standard)
  if (platform === "instagram_story" || platform === "gbp") return false;
  return true;
}

function formatSceneHeadline(sceneType: string): string {
  return sceneType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Load tenant signals from DB for the playbook.
 */
export async function loadTenantSignals(siteId: string): Promise<TenantSignals> {
  const [site] = await sql`
    SELECT s.business_type, s.render_config,
           sub.plan
    FROM sites s
    JOIN subscriptions sub ON sub.id = s.subscription_id
    WHERE s.id = ${siteId}
  `;

  const plan = ((site?.plan as string) || "growth").toLowerCase();
  const tier = plan.includes("enterprise")
    ? "enterprise" as const
    : plan.includes("authority")
    ? "authority" as const
    : "growth" as const;

  // Get connected platforms
  const platforms = await sql`
    SELECT sa.platform
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId} AND sa.status = 'active'
  `;

  const connectedPlatforms = platforms.map(
    (p) => String(p.platform).toLowerCase() as PlatformKey,
  );

  return {
    businessType: (site?.business_type as string) || null,
    renderConfig: (site?.render_config as RenderConfig) || {},
    tier,
    connectedPlatforms,
  };
}

/**
 * Load content signals from an asset row.
 */
export async function loadContentSignals(assetId: string): Promise<ContentSignals> {
  const [asset] = await sql`
    SELECT quality_score, media_type,
           ai_analysis->>'scene_type' AS scene_type
    FROM media_assets WHERE id = ${assetId}
  `;

  // Check if this asset is a project hero
  const [heroCheck] = await sql`
    SELECT 1 FROM projects WHERE hero_asset_id = ${assetId} LIMIT 1
  `;

  // Check project association
  const [projectLink] = await sql`
    SELECT project_id FROM asset_projects WHERE asset_id = ${assetId} LIMIT 1
  `;

  return {
    qualityScore: asset?.quality_score ? Number(asset.quality_score) : null,
    sceneType: (asset?.scene_type as string) || null,
    projectId: projectLink?.project_id ? String(projectLink.project_id) : null,
    isProjectHero: !!heroCheck,
    mediaType: (asset?.media_type as string) || "image/jpeg",
  };
}
