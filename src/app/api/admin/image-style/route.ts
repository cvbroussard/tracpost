import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { siteId, style, variations, processingMode, contentVibe, videoRatio, inlineUploadCount, inlineAiCount, blogCadence, articleRatio } = body;

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  // Build dynamic update — only update fields that are provided
  if (blogCadence !== undefined && Object.keys(body).length === 2) {
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
