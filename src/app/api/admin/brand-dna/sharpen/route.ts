/**
 * POST /api/admin/brand-dna/sharpen
 * Body: { siteId, angle }
 *
 * Refines the cached Brand DNA around the subscriber's stated differentiator.
 * Reuses extracted signals (no Haiku re-run); regenerates only the playbook
 * with the angle prepended as highest-priority strategic input.
 *
 * Cost: 1 Sonnet (~$0.10). Updates sites.brand_dna in place.
 * Stores the angle in the envelope so subsequent regenerates retain it.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import { generatePlaybookV2 } from "@/lib/brand-dna/auto-generate-v2";
import type { BrandSignals } from "@/lib/brand-dna/extract";
import type { BrandPlaybook } from "@/lib/brand-intelligence/types";
import type { Tier } from "@/lib/brand-dna/score";

export const runtime = "nodejs";
export const maxDuration = 300;

interface DnaEnvelope {
  playbook: BrandPlaybook;
  signals: BrandSignals | null;
  score: { score: number; tier: Tier };
  generated_at: string;
  version: string;
  subscriber_angle?: string;
}

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { siteId, angle } = await req.json().catch(() => ({}));
  if (!siteId || !angle?.trim()) {
    return NextResponse.json({ error: "siteId and angle required" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT business_type, location, url, brand_dna FROM sites WHERE id = ${siteId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }
  const cached = site.brand_dna as DnaEnvelope | null;
  if (!cached) {
    return NextResponse.json({ error: "No Brand DNA generated yet — run Compare first" }, { status: 400 });
  }

  const businessType = (site.business_type as string) || "business";
  const location = (site.location as string) || undefined;
  const websiteUrl = (site.url as string) || undefined;

  // Re-generate the playbook only (signals + score reused — they're independent of angle)
  const refined = await generatePlaybookV2({
    businessType, location, websiteUrl,
    tier: cached.score.tier,
    signals: cached.signals || undefined,
    subscriberAngle: angle.trim(),
  });

  const envelope: DnaEnvelope = {
    playbook: refined,
    signals: cached.signals,
    score: cached.score,
    generated_at: new Date().toISOString(),
    version: `${refined.version}-sharpened`,
    subscriber_angle: angle.trim(),
  };

  await sql`
    UPDATE sites
    SET brand_dna = ${JSON.stringify(envelope)}::jsonb, updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({ success: true, envelope });
}
