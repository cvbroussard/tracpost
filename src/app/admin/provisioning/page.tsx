import { sql } from "@/lib/db";
import Link from "next/link";
import { generateProfileKit } from "@/lib/provisioning/profile-kit";
import { getBrandPlaybookFromDescriptor } from "@/lib/brand-identity/playbook-from-descriptor";
import { ProfileKitPanel } from "./profile-kit-panel";
import { ProvisionActions } from "./provision-actions";
import { AdminConnectButton } from "./admin-connect-button";
import { AdminPillarEditor } from "./pillar-config-editor";
import { ImageStyleEditor } from "./image-style-editor";
import { ContextReview } from "./context-review";

export const dynamic = "force-dynamic";

const ALL_PLATFORMS = [
  "instagram", "tiktok", "facebook", "gbp",
  "youtube", "twitter", "linkedin", "pinterest",
];

export default async function ProvisioningPage() {
  const subscribers = await sql`
    SELECT
      sub.id AS billing_account_id,
      u.name AS subscriber_name,
      u.email,
      sub.plan,
      sub.created_at,
      sub.metadata,
      s.id AS business_id,
      s.name AS site_name,
      s.url AS site_url,
      s.business_type,
      s.location,
      s.blog_slug,
      EXISTS(
        SELECT 1 FROM brand_identity bi
        JOIN brand_descriptor bd ON bd.brand_identity_id = bi.id
        WHERE bi.business_id = s.id AND bi.is_primary = true AND bd.declared IS NOT NULL
        LIMIT 1
      ) AS has_playbook,
      s.provisioning_status,
      s.pillar_config,
      s.image_style,
      s.image_variations,
      s.image_processing_mode,
      s.content_vibe,
      s.metadata AS site_metadata,
      s.deleted_at,
      (
        SELECT array_agg(DISTINCT sa.platform)
        FROM social_accounts sa
        JOIN business_social_links ssl ON ssl.social_account_id = sa.id
        WHERE ssl.business_id = s.id AND sa.status = 'active'
      ) AS connected_platforms,
      (
        SELECT blog_enabled FROM blog_settings WHERE business_id = s.id
      ) AS blog_enabled
    FROM accounts sub
    JOIN users u ON u.id = sub.owner_user_id
    JOIN businesses s ON s.billing_account_id = sub.id
    WHERE sub.is_active = true AND s.is_active = true
    ORDER BY sub.created_at DESC
  `;

  return (
    <div className="mx-auto max-w-5xl">
      <h1>Provisioning</h1>
      <p className="mt-2 mb-8 text-muted">New subscriber setup and social account provisioning</p>

      {subscribers.length === 0 ? (
        <p className="py-12 text-center text-muted">No subscribers to provision</p>
      ) : (
        <div>
          {(await Promise.all(subscribers.map(async (sub) => {
            const connected = (sub.connected_platforms as string[] | null) || [];
            const missing = ALL_PLATFORMS.filter((p) => !connected.includes(p));
            const meta = (sub.metadata || {}) as Record<string, unknown>;
            const onboardingStatus = meta.onboarding_status as string;
            const isNew = onboardingStatus === "new" || onboardingStatus === "complete";
            const allProvisioned = sub.provisioning_status === "complete";

            // Generate profile kit if playbook exists
            let profileKit = null;
            const subPlaybook = await getBrandPlaybookFromDescriptor(sub.business_id as string);
            if (sub.has_playbook && subPlaybook) {
              try {
                profileKit = generateProfileKit({
                  siteName: sub.site_name as string,
                  businessType: (sub.business_type as string) || "Business",
                  location: (sub.location as string) || "",
                  blogSlug: (sub.blog_slug as string) || "",
                  siteUrl: sub.site_url as string | null,
                  playbook: subPlaybook,
                });
              } catch {
                // Kit generation failed — show without it
              }
            }

            // Fetch assets for context review
            const siteAssets = sub.business_id ? await sql`
              SELECT id, storage_url, context_note, quality_score, metadata, ai_analysis
              FROM media_assets
              WHERE business_id = ${sub.business_id}
                AND processing_stage IN ('briefed', 'analyzed')
              ORDER BY quality_score DESC
              LIMIT 50
            ` : [];

            const contextAssets = siteAssets.map((a) => ({
              id: a.id as string,
              storage_url: a.storage_url as string,
              context_note: a.context_note as string | null,
              quality_score: a.quality_score as number | null,
              context_auto_generated: !!(a.metadata as Record<string, unknown>)?.context_auto_generated,
              detected_vendors: ((a.ai_analysis as Record<string, unknown>)?.detected_vendors as string[]) || [],
            }));

            return (
              <div
                key={`${sub.billing_account_id}-${sub.business_id}`}
                className="mb-6 border-b border-border pb-6 last:border-0"
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 style={{ marginTop: 0 }}>{sub.site_name || sub.subscriber_name}</h2>
                      <a
                        href={`/admin/sites/${sub.business_id}`}
                        className="text-[10px] text-accent hover:underline"
                      >
                        Controls
                      </a>
                      {sub.provisioning_status === "complete" ? (
                        <span className="rounded bg-success/10 px-2 py-0.5 text-xs text-success">Ready</span>
                      ) : sub.provisioning_status === "in_progress" ? (
                        <span className="rounded bg-accent/10 px-2 py-0.5 text-xs text-accent">In progress</span>
                      ) : (
                        <span className="rounded bg-warning/10 px-2 py-0.5 text-xs text-warning">Requested</span>
                      )}
                    </div>
                    <p className="text-sm text-muted">
                      {sub.business_type || "No type"} · {sub.location || "No location"} · {sub.plan}
                    </p>
                    <p className="text-sm text-muted">
                      {sub.email} · {sub.site_url || "No website"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <ProvisionActions
                      siteId={sub.business_id as string}
                      status={sub.provisioning_status as string | null}
                    />
                    <Link
                      href={`/admin/accounts/${sub.billing_account_id}`}
                      className="text-sm text-accent hover:underline"
                    >
                      View subscriber
                    </Link>
                  </div>
                </div>

                {/* Provisioning checklist */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  {/* Playbook */}
                  <ChecklistItem done={!!sub.has_playbook} label="Brand playbook" pendingLabel="(auto-generating...)" />
                  {/* Blog */}
                  <ChecklistItem done={!!sub.blog_enabled} label="Blog enabled" />
                  {/* Each platform */}
                  {ALL_PLATFORMS.map((platform) => (
                    <ChecklistItem key={platform} done={connected.includes(platform)} label={platform} />
                  ))}
                </div>

                {/* Profile Kit */}
                {/* Connect accounts (admin OAuth on behalf of subscriber) */}
                <AdminConnectButton
                  siteId={sub.business_id as string}
                  subscriptionId={sub.billing_account_id as string}
                  connectedPlatforms={connected}
                />

                {/* Pillar+Tag Config */}
                <AdminPillarEditor
                  siteId={sub.business_id as string}
                  initialConfig={
                    (sub.pillar_config as Array<{ id: string; framework?: string; label: string; description: string; tags: Array<{ id: string; label: string }> }>) || []
                  }
                />

                {/* Image Style */}
                <ImageStyleEditor
                  siteId={sub.business_id as string}
                  initialStyle={(sub.image_style as string) || ""}
                  initialVariations={(sub.image_variations as string[]) || []}
                  initialProcessingMode={(sub.image_processing_mode as string) || "auto"}
                  initialContentVibe={(sub.content_vibe as string) || ""}
                />

                {/* Context Note Review */}
                {contextAssets.length > 0 && (
                  <ContextReview
                    siteId={sub.business_id as string}
                    initialAssets={contextAssets}
                  />
                )}

                {profileKit && (
                  <ProfileKitPanel
                    kit={profileKit}
                    existingAccounts={((sub.site_metadata as Record<string, unknown>)?.existing_accounts as string[]) || undefined}
                  />
                )}
              </div>
            );
          })))}
        </div>
      )}
    </div>
  );
}

function ChecklistItem({ done, label, pendingLabel }: { done: boolean; label: string; pendingLabel?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span style={{
        width: 16, height: 16, borderRadius: "50%", display: "inline-flex",
        alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600,
        background: done ? "var(--color-success)" : "var(--color-surface-hover)",
        color: done ? "#fff" : "var(--color-muted)",
      }}>
        {done ? "✓" : ""}
      </span>
      <span className={done ? "text-muted" : ""}>
        {label} {!done && pendingLabel ? pendingLabel : ""}
      </span>
    </div>
  );
}
