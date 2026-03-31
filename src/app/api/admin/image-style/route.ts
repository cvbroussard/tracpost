import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { siteId, style, variations, processingMode, contentVibe } = body;

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  await sql`
    UPDATE sites
    SET image_style = ${style || null},
        image_variations = ${JSON.stringify(variations || [])}::jsonb,
        image_processing_mode = ${processingMode || 'auto'},
        content_vibe = ${contentVibe || null}
    WHERE id = ${siteId}
  `;

  return NextResponse.json({ success: true });
}
