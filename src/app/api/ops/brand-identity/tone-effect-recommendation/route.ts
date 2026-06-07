/**
 * POST /api/ops/brand-identity/tone-effect-recommendation { siteId }
 *   Triggers (or re-triggers) generation of the 3-suggestion tone.effect substrate.
 *
 * GET  /api/ops/brand-identity/tone-effect-recommendation?siteId=<uuid>
 *   Returns the current substrate payload, or { suggestions: null }.
 *
 * Operator-authed.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  generateToneEffectRecommendation,
  readToneEffectRecommendation,
} from "@/lib/brand-identity/tone-effect-generator";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const payload = await readToneEffectRecommendation(siteId);
  return NextResponse.json({ suggestions: payload });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = (await req.json()) ?? {};
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const result = await generateToneEffectRecommendation({ businessId: siteId });
  return NextResponse.json(result);
}
