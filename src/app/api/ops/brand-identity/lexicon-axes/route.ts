/**
 * POST /api/ops/brand-identity/lexicon-axes { siteId }
 *   Triggers (or re-triggers) generation of the vocabulary-axes substrate.
 *
 * GET  /api/ops/brand-identity/lexicon-axes?siteId=<uuid>
 *   Returns the current substrate payload, or { axes: null }.
 *
 * Operator-authed.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  generateLexiconAxes,
  readLexiconAxes,
} from "@/lib/brand-identity/lexicon-axes-generator";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const payload = await readLexiconAxes(siteId);
  return NextResponse.json({ axes: payload });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = (await req.json()) ?? {};
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const result = await generateLexiconAxes({ businessId: siteId });
  return NextResponse.json(result);
}
