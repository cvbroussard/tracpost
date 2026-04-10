import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { siteId, style, variations, processingMode, contentVibe, videoRatio, inlineUploadCount, inlineAiCount, blogCadence, articleRatio, autopilotEnabled, blogSlug, navLinks } = body;

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  // Build dynamic update — only update fields that are provided
  if (autopilotEnabled !== undefined && Object.keys(body).length === 2) {
    // When admin manually disables, set lock so auto-activation doesn't re-enable.
    // When admin manually enables, clear the lock.
    if (autopilotEnabled) {
      await sql`
        UPDATE sites
        SET autopilot_enabled = true,
            metadata = COALESCE(metadata, '{}'::jsonb) - 'autopilot_locked',
            updated_at = NOW()
        WHERE id = ${siteId}
      `;
    } else {
      await sql`
        UPDATE sites
        SET autopilot_enabled = false,
            metadata = COALESCE(metadata, '{}'::jsonb) || '{"autopilot_locked":"true"}'::jsonb,
            updated_at = NOW()
        WHERE id = ${siteId}
      `;
    }
  } else if (navLinks !== undefined && Object.keys(body).length === 2) {
    // Filter out empty links
    const filtered = (navLinks as Array<{ label: string; href: string }>)
      .filter((l) => l.label.trim() && l.href.trim());
    await sql`
      UPDATE blog_settings SET nav_links = ${JSON.stringify(filtered)}::jsonb, updated_at = NOW()
      WHERE site_id = ${siteId}
    `;
  } else if (blogSlug !== undefined && Object.keys(body).length === 2) {
    // Update both blog_settings.subdomain and sites.blog_slug
    const slug = blogSlug.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);
    if (!slug) {
      return NextResponse.json({ error: "Blog slug cannot be empty" }, { status: 400 });
    }
    // Check uniqueness
    const [existing] = await sql`
      SELECT site_id FROM blog_settings WHERE subdomain = ${slug} AND site_id != ${siteId}
    `;
    if (existing) {
      return NextResponse.json({ error: "Blog slug already taken" }, { status: 409 });
    }
    await sql`UPDATE sites SET blog_slug = ${slug}, updated_at = NOW() WHERE id = ${siteId}`;
    await sql`
      UPDATE blog_settings SET subdomain = ${slug}, updated_at = NOW() WHERE site_id = ${siteId}
    `;
  } else if (blogCadence !== undefined && Object.keys(body).length === 2) {
    await sql`UPDATE sites SET blog_cadence = ${blogCadence} WHERE id = ${siteId}`;
  } else if (articleRatio !== undefined && Object.keys(body).length === 2) {
    await sql`UPDATE sites SET article_mix = ${articleRatio} WHERE id = ${siteId}`;
  } else if (videoRatio !== undefined && Object.keys(body).length === 2) {
    await sql`UPDATE sites SET video_ratio = ${videoRatio} WHERE id = ${siteId}`;
  } else if (inlineUploadCount !== undefined && inlineAiCount !== undefined && Object.keys(body).length === 3) {
    await sql`UPDATE sites SET inline_upload_count = ${inlineUploadCount}, inline_ai_count = ${inlineAiCount} WHERE id = ${siteId}`;
  } else {
    await sql`
      UPDATE sites
      SET image_style = ${style || null},
          image_variations = ${JSON.stringify(variations || [])}::jsonb,
          image_processing_mode = ${processingMode || 'auto'},
          content_vibe = ${contentVibe || null}
      WHERE id = ${siteId}
    `;
  }

  return NextResponse.json({ success: true });
}
