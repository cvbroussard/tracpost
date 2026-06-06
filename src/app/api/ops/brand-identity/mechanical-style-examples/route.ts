/**
 * POST /api/ops/brand-identity/mechanical-style-examples { siteId }
 *   Triggers (or re-triggers) generation of the 3-paragraph substrate.
 *
 * GET  /api/ops/brand-identity/mechanical-style-examples?siteId=<uuid>
 *   Returns the current substrate payload, or { examples: null }.
 *
 * Operator-authed.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  generateMechanicalStyleExamples,
  readMechanicalStyleExamples,
} from "@/lib/brand-identity/mechanical-style-generator";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const payload = await readMechanicalStyleExamples(siteId);
  return NextResponse.json({ examples: payload });
}

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = (await req.json()) ?? {};
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const result = await generateMechanicalStyleExamples({ businessId: siteId });
  return NextResponse.json(result);
}
