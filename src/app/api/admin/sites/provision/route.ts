import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { autoGeneratePlaybook } from "@/lib/brand-intelligence/auto-generate";

/**
 * POST /api/admin/sites/provision
 * Body: { siteId, action: "start" | "complete" }
 *
 * start: requested → in_progress
 *   Triggers behind-the-curtain automation:
 *   1. Auto-generate brand playbook (if missing)
 *   2. Enable blog + seed content (if not enabled)
 *
 * complete: in_progress → complete
 *   Admin confirms all manual steps are done (social accounts created/linked).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { siteId, action } = body;

  if (!siteId || !action) {
    return NextResponse.json({ error: "siteId and action required" }, { status: 400 });
  }

  if (action === "start") {
    const [site] = await sql`
      UPDATE sites
      SET provisioning_status = 'in_progress', updated_at = NOW()
      WHERE id = ${siteId} AND provisioning_status IN ('requested', 'in_progress') AND is_active = true
      RETURNING id, name, business_type, location, url, brand_playbook IS NOT NULL AS has_playbook
    `;
    if (!site) {
      return NextResponse.json({ error: "Site not found or not in requested state" }, { status: 404 });
    }

    const automationResults: string[] = [];

    // 1. Auto-generate brand playbook if missing
    if (!site.has_playbook && site.business_type) {
      try {
        await autoGeneratePlaybook(
          siteId,
          site.business_type as string,
          (site.location as string) || undefined,
          (site.url as string) || undefined,
        );
        automationResults.push("playbook_generated");
      } catch (err) {
        automationResults.push(`playbook_failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    // 2. Enable blog + seed content if not already enabled
    // Enable blog settings (but don't seed content — wait for playbook sharpening)
    const [blogSettings] = await sql`
      SELECT blog_enabled FROM blog_settings WHERE site_id = ${siteId}
    `;
    if (!blogSettings?.blog_enabled) {
      try {
        // Generate subdomain from site name: "B2 Construction" → "b2-construction"
        const baseSubdomain = (site.name as string)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 40);

        // Ensure uniqueness — append a suffix if taken
        let subdomain = baseSubdomain;
        const [existing] = await sql`
          SELECT 1 FROM blog_settings WHERE subdomain = ${subdomain}
        `;
        if (existing) {
          subdomain = `${baseSubdomain}-${Date.now().toString(36).slice(-4)}`;
        }

        await sql`
          INSERT INTO blog_settings (site_id, blog_enabled, subdomain, blog_title, blog_description)
          VALUES (
            ${siteId},
            true,
            ${subdomain},
            ${site.name + " Blog"},
            ${`Latest updates from ${site.name}`}
          )
          ON CONFLICT (site_id) DO UPDATE SET
            blog_enabled = true,
            subdomain = COALESCE(blog_settings.subdomain, ${subdomain}),
            blog_title = COALESCE(blog_settings.blog_title, ${site.name + " Blog"}),
            updated_at = NOW()
        `;
        automationResults.push(`blog_enabled (subdomain: ${subdomain})`);
      } catch (err) {
        automationResults.push(`blog_failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    // 3. Derive blog theme from tenant's website
    if (site.url) {
      try {
        const { deriveBlogTheme } = await import("@/lib/blog-theme-derive");
        await deriveBlogTheme(siteId, site.url as string);
        automationResults.push("blog_theme_derived");
      } catch (err) {
        automationResults.push(`theme_failed: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    return NextResponse.json({
      ok: true,
      siteId,
      status: "in_progress",
      automation: automationResults,
    });
  }

  if (action === "complete") {
    const [site] = await sql`
      UPDATE sites
      SET provisioning_status = 'complete', updated_at = NOW()
      WHERE id = ${siteId} AND provisioning_status = 'in_progress' AND is_active = true
      RETURNING id, name
    `;
    if (!site) {
      return NextResponse.json({ error: "Site not found or not in_progress" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, siteId, status: "complete" });
  }

  return NextResponse.json({ error: "Invalid action. Use 'start' or 'complete'" }, { status: 400 });
}
