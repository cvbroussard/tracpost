import { sql } from "@/lib/db";
import { notFound } from "next/navigation";
import { SiteControls } from "./site-controls";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ siteId: string }>;
}

export default async function SiteControlPanel({ params }: Props) {
  const { siteId } = await params;

  const [site] = await sql`
    SELECT s.id, s.name, s.url, s.business_type, s.location,
           s.brand_voice, s.brand_playbook,
           s.content_vibe, s.image_style, s.image_variations,
           s.image_processing_mode, s.pillar_config,
           s.autopilot_enabled, s.cadence_config, s.autopilot_config,
           s.provisioning_status, s.metadata, s.video_ratio,
           s.inline_upload_count, s.inline_ai_count,
           u.name AS subscriber_name, sub.plan,
           bs.blog_enabled, bs.subdomain, bs.custom_domain,
           bs.blog_title, bs.blog_description
    FROM sites s
    JOIN subscriptions sub ON sub.id = s.subscription_id
    JOIN users u ON u.subscription_id = sub.id AND u.role = 'owner'
    LEFT JOIN blog_settings bs ON bs.site_id = s.id
    WHERE s.id = ${siteId}
  `;

  if (!site) notFound();

  // Counts
  const [counts] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM media_assets WHERE site_id = ${siteId}) AS total_assets,
      (SELECT COUNT(*)::int FROM media_assets WHERE site_id = ${siteId} AND source = 'upload') AS uploads,
      (SELECT COUNT(*)::int FROM media_assets WHERE site_id = ${siteId} AND source = 'ai_generated') AS ai_assets,
      (SELECT COUNT(*)::int FROM blog_posts WHERE site_id = ${siteId}) AS total_posts,
      (SELECT COUNT(*)::int FROM blog_posts WHERE site_id = ${siteId} AND status = 'published') AS published_posts,
      (SELECT COUNT(*)::int FROM blog_posts WHERE site_id = ${siteId} AND status = 'draft') AS draft_posts,
      (SELECT COUNT(*)::int FROM brands WHERE site_id = ${siteId}) AS vendors,
      (SELECT COUNT(*)::int FROM projects WHERE site_id = ${siteId}) AS projects,
      (SELECT COUNT(*)::int FROM personas WHERE site_id = ${siteId}) AS personas,
      (SELECT COUNT(*)::int FROM locations WHERE site_id = ${siteId}) AS locations,
      (SELECT COUNT(*)::int FROM image_corrections WHERE site_id = ${siteId}) AS corrections
  `;

  // Reward prompts count
  const metadata = (site.metadata || {}) as Record<string, unknown>;
  const rewardPrompts = (metadata.reward_prompts as unknown[]) || [];

  // Connected platforms
  const platforms = await sql`
    SELECT sa.platform, sa.account_name, sa.status
    FROM social_accounts sa
    JOIN site_social_links ssl ON ssl.social_account_id = sa.id
    WHERE ssl.site_id = ${siteId}
    ORDER BY sa.platform
  `;

  // Projects for article generation
  const projects = await sql`
    SELECT id, name, slug FROM projects WHERE site_id = ${siteId} ORDER BY name
  `;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-1.5 text-xs text-muted">
        <a href="/admin/sites" className="hover:text-accent">Site Controls</a>
        <span>/</span>
        <span className="text-foreground">{site.name}</span>
      </div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold">{site.name}</h1>
        <p className="text-sm text-muted">
          {site.subscriber_name} · {site.plan} · {site.provisioning_status}
        </p>
      </div>

      <SiteControls
        siteId={siteId}
        site={{
          name: site.name as string,
          url: site.url as string | null,
          businessType: (site.business_type as string) || "",
          location: (site.location as string) || "",
          contentVibe: (site.content_vibe as string) || "",
          imageStyle: (site.image_style as string) || "",
          imageVariations: (site.image_variations as string[]) || [],
          imageProcessingMode: (site.image_processing_mode as string) || "auto",
          autopilotEnabled: site.autopilot_enabled as boolean,
          cadenceConfig: (site.cadence_config || {}) as Record<string, number>,
          blogEnabled: site.blog_enabled as boolean || false,
          blogTitle: (site.blog_title as string) || "",
          subdomain: (site.subdomain as string) || "",
          videoRatio: (site.video_ratio as string) || "1:3",
          inlineUploadCount: (site.inline_upload_count as number) ?? 1,
          inlineAiCount: (site.inline_ai_count as number) ?? 3,
        }}
        counts={{
          totalAssets: counts?.total_assets || 0,
          uploads: counts?.uploads || 0,
          aiAssets: counts?.ai_assets || 0,
          totalPosts: counts?.total_posts || 0,
          publishedPosts: counts?.published_posts || 0,
          draftPosts: counts?.draft_posts || 0,
          vendors: counts?.vendors || 0,
          projects: counts?.projects || 0,
          personas: counts?.personas || 0,
          locations: counts?.locations || 0,
          corrections: counts?.corrections || 0,
          rewardPrompts: rewardPrompts.length,
        }}
        platforms={platforms as Array<{ platform: string; account_name: string; status: string }>}
        rewardPrompts={rewardPrompts as Array<{ category: string; scene: string; prompt: string; visual: string }>}
        projects={projects as Array<{ id: string; name: string; slug: string }>}
      />
    </div>
  );
}
