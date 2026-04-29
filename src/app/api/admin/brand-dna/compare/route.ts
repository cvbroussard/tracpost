/**
 * POST /api/admin/brand-dna/compare
 * Body: { siteId, force?: boolean }
 *
 * Returns:
 *   - score, signals, baseline (from sites.brand_playbook), v2 envelope
 *   - activeSource: which one is currently active
 *
 * Cache behavior: if sites.brand_dna already has a generated envelope and
 * force !== true, returns it immediately (zero LLM cost). Pass force=true to
 * regenerate (extract + sonnet) and overwrite the cached envelope.
 *
 * COST when fresh: 2 Haiku + 1 Sonnet (~$0.15)
 * COST when cached: 0
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import { scoreBrandSignals } from "@/lib/brand-dna/score";
import { extractBrandSignals } from "@/lib/brand-dna/extract";
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

// GET — read-only state (score + cached envelope if any). No LLM calls.
export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = new URL(req.url).searchParams.get("siteId");
  if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });

  const [site] = await sql`
    SELECT business_type, location, brand_playbook, brand_dna,
           active_brand_source, name
    FROM sites WHERE id = ${siteId}
  `;
  if (!site) return NextResponse.json({ error: "Site not found" }, { status: 404 });

  const score = await scoreBrandSignals(siteId);
  const cached = site.brand_dna as DnaEnvelope | null;

  return NextResponse.json({
    site: { id: siteId, name: site.name, businessType: site.business_type, location: site.location },
    score,
    baseline: site.brand_playbook,
    dna: cached,
    activeSource: site.active_brand_source,
  });
}

export async function POST(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const siteId = body.siteId as string | undefined;
  const force = body.force === true;

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const [site] = await sql`
    SELECT business_type, location, url, brand_playbook, brand_dna,
           active_brand_source, name
    FROM sites WHERE id = ${siteId}
  `;
  if (!site) {
    return NextResponse.json({ error: "Site not found" }, { status: 404 });
  }

  const businessType = (site.business_type as string) || "business";
  const location = (site.location as string) || undefined;
  const websiteUrl = (site.url as string) || undefined;
  const cached = site.brand_dna as DnaEnvelope | null;

  // 1. Score is always fresh — cheap, no LLM
  const score = await scoreBrandSignals(siteId);

  // 2. If cached + not forced, return immediately
  if (cached && !force) {
    return NextResponse.json({
      site: { id: siteId, name: site.name, businessType, location },
      score,
      signals: cached.signals,
      baseline: site.brand_playbook,
      v2: cached.playbook,
      activeSource: site.active_brand_source,
      cached: true,
      generatedAt: cached.generated_at,
    });
  }

  // 3. Extract signals (skip for minimal tier)
  const signals = score.tier !== "minimal" ? await extractBrandSignals(siteId) : null;

  // 4. Generate v2
  const v2 = await generatePlaybookV2({
    businessType, location, websiteUrl,
    tier: score.tier,
    signals: signals || undefined,
  });

  // 5. Persist envelope to brand_dna (does NOT change active_brand_source)
  const envelope: DnaEnvelope = {
    playbook: v2,
    signals,
    score: { score: score.score, tier: score.tier },
    generated_at: new Date().toISOString(),
    version: v2.version || `2.0-v2-${score.tier}`,
  };
  await sql`
    UPDATE sites
    SET brand_dna = ${JSON.stringify(envelope)}::jsonb,
        updated_at = NOW()
    WHERE id = ${siteId}
  `;

  return NextResponse.json({
    site: { id: siteId, name: site.name, businessType, location },
    score,
    signals,
    baseline: site.brand_playbook,
    v2,
    activeSource: site.active_brand_source,
    cached: false,
    generatedAt: envelope.generated_at,
  });
}
