import { sql } from "@/lib/db";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { SiteDeactivation } from "./site-deactivation";
import { EditExistingAccounts } from "./edit-existing-accounts";
import { BlogSettings } from "../blog/blog-settings";
import { BusinessInfo } from "./business-info";
import { CommercialTierPicker } from "./commercial-tier-picker";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.activeSiteId) {
    return (
      <div className="p-4 space-y-6">
        <h1>Settings</h1>
        <p className="mt-2 py-12 text-center text-muted">No business configured yet.</p>
      </div>
    );
  }

  const siteId = session.activeSiteId;

  const [[site], blogSettingsRows, [blogCounts], [lastArticle]] = await Promise.all([
    sql`
      SELECT s.name, s.url, s.business_type, s.location,
             s.place_id, s.place_lat, s.place_lon, s.place_name,
             s.brand_voice, s.autopilot_enabled, s.cadence_config,
             s.content_pillars, s.pillar_config, s.autopilot_config, s.created_at,
             s.is_active, s.blog_cadence,
             s.business_phone, s.business_email, s.business_logo, s.business_favicon,
             s.brand_assets,
             s.provisioning_status, s.metadata AS site_metadata
      FROM businesses s
      WHERE s.id = ${siteId}
    `,
    sql`
      SELECT blog_enabled, subdomain, custom_domain, blog_title, blog_description
      FROM blog_settings WHERE business_id = ${siteId}
    `,
    sql`
      SELECT
        (COUNT(*) FILTER (WHERE status = 'published'))::int AS published,
        COUNT(*)::int AS total
      FROM blog_posts WHERE business_id = ${siteId}
    `,
    sql`
      SELECT created_at FROM blog_posts
      WHERE business_id = ${siteId}
      ORDER BY created_at DESC LIMIT 1
    `,
  ]);

  const blogSettings = blogSettingsRows[0] || {
    blog_enabled: false, subdomain: null, custom_domain: null,
    blog_title: null, blog_description: null,
  };

  const brandVoice = (site?.brand_voice || {}) as Record<string, unknown>;
  // cadence_config evolved from Record<string, number> to
  // Record<string, PlatformCadence> (object with frequency, time_windows,
  // etc.). Type as unknown and coerce in the renderer to handle both shapes.
  const cadence = (site?.cadence_config || {}) as Record<string, unknown>;
  const pillars = (site?.content_pillars || []) as string[];
  const autopilotConfig = (site?.autopilot_config || {}) as Record<string, unknown>;

  return (
    <div className="p-4 space-y-6">
      <h1>Business</h1>
      <p className="mt-2 mb-8 text-muted">Profile, autopilot, brand voice, and blog configuration</p>

      {/* Business Profile */}
      <section className="mb-8">
        <h2 className="mb-4">Business Profile</h2>
        <BusinessInfo
          initial={{
            name: (site?.name as string) || "",
            business_type: (site?.business_type as string) || null,
            location: (site?.location as string) || null,
            place_id: (site?.place_id as string) || null,
            place_lat: site?.place_lat != null ? Number(site.place_lat) : null,
            place_lon: site?.place_lon != null ? Number(site.place_lon) : null,
            place_name: (site?.place_name as string) || null,
            business_phone: (site?.business_phone as string) || null,
            business_email: (site?.business_email as string) || null,
            business_logo: (site?.business_logo as string) || null,
            business_favicon: (site?.business_favicon as string) || null,
            og_image: ((site?.brand_assets as Record<string, unknown>)?.ogImage as string) || null,
            og_title: ((site?.brand_assets as Record<string, unknown>)?.ogTitle as string) || null,
            og_description: ((site?.brand_assets as Record<string, unknown>)?.ogDescription as string) || null,
          }}
        />
        <div className="mt-4 flex items-baseline justify-between border-t border-border py-2">
          <span className="text-sm text-muted">Website URL</span>
          <span className="text-sm">{site?.url || <span className="text-dim">— not set</span>}</span>
        </div>
      </section>

      {/* Commercial tier — subscriber-declared (per project_tracpost_tier_model) */}
      <section className="mb-8">
        <CommercialTierPicker siteId={siteId} siteName={(site?.name as string) || "your business"} />
      </section>

      {/* Autopilot */}
      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2>Autopilot</h2>
          <span className={`text-sm ${site?.autopilot_enabled ? "text-success" : "text-muted"}`}>
            {site?.autopilot_enabled ? "Active" : "Off"}
          </span>
        </div>

        {Object.keys(cadence).length > 0 && (
          <div className="mb-5">
            <label className="mb-2 block text-sm text-muted">Publishing Cadence</label>
            <div className="flex flex-wrap gap-6">
              {Object.entries(cadence).map(([platform, val]) => {
                // Legacy: number (posts/week). Current: PlatformCadence object
                // with .frequency. Coerce to a printable count either way.
                const count =
                  typeof val === "number"
                    ? val
                    : (val as { frequency?: number } | null)?.frequency ?? 0;
                return (
                  <div key={platform}>
                    <p className="text-2xl font-semibold">{count}</p>
                    <p className="text-sm text-muted">{platform}/week</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {pillars.length > 0 && (
          <div className="mb-5">
            <label className="mb-2 block text-sm text-muted">Content Pillars</label>
            <div className="flex flex-wrap gap-2">
              {pillars.map((p) => (
                <span key={p} className="rounded bg-accent/10 px-2 py-1 text-sm text-accent">{p}</span>
              ))}
            </div>
          </div>
        )}

        {Object.keys(autopilotConfig).length > 0 && (
          <div>
            <label className="mb-2 block text-sm text-muted">Configuration</label>
            <div className="space-y-2">
              {Object.entries(autopilotConfig).map(([key, val]) => (
                <div key={key} className="flex justify-between border-b border-border py-2 text-sm">
                  <span className="text-muted">{key.replace(/_/g, " ")}</span>
                  <span className="font-medium">{String(val)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Brand Voice */}
      <section className="mb-8">
        <h2 className="mb-4">Brand Voice</h2>
        {Object.keys(brandVoice).length > 0 ? (
          <div className="space-y-2">
            {Object.entries(brandVoice).map(([key, val]) => (
              <div key={key} className="flex items-baseline justify-between border-b border-border py-2">
                <span className="text-sm text-muted">{key}</span>
                <span className="max-w-xs text-right font-medium">
                  {Array.isArray(val) ? val.join(", ") : String(val)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            No brand voice configured. Complete the Brand Intelligence wizard to generate one.
          </p>
        )}
      </section>

      {/* Blog */}
      <section className="mb-8">
        <h2 className="mb-4">Your Blog</h2>
        <BlogSettings
          siteId={siteId}
          initialSettings={blogSettings as {
            blog_enabled: boolean;
            subdomain: string | null;
            custom_domain: string | null;
            blog_title: string | null;
            blog_description: string | null;
          }}
          publishedCount={(blogCounts?.published as number) || 0}
          totalCount={(blogCounts?.total as number) || 0}
          nextArticleDate={(() => {
            const cadence = (site?.blog_cadence as number) || 0;
            if (!cadence || !lastArticle?.created_at) return null;
            const intervalDays = 7 / cadence;
            const next = new Date(lastArticle.created_at as string);
            next.setDate(next.getDate() + intervalDays);
            return next.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
          })()}
        />
      </section>

      {/* Editable existing accounts — only while provisioning is pending */}
      {site?.provisioning_status === "requested" && (
        <EditExistingAccounts
          siteId={siteId}
          initialExisting={
            ((site?.site_metadata as Record<string, unknown>)?.existing_accounts as string[]) || []
          }
        />
      )}

      {/* Site Deactivation */}
      <SiteDeactivation
        siteId={siteId}
        siteName={site?.name ? String(site.name) : "this business"}
        isActive={site?.is_active !== false}
      />
    </div>
  );
}
