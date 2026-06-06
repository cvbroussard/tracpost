/**
 * GET  /api/ops/brand-identity/env-look-examples?siteId=<uuid>
 * POST /api/ops/brand-identity/env-look-examples { siteId }
 *
 * Operator-authed.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  generateEnvLookExamples,
  readEnvLookExamples,
} from "@/lib/brand-identity/env-look-generator";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const payload = await readEnvLookExamples(siteId);
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
  const result = await generateEnvLookExamples({ businessId: siteId });
  return NextResponse.json(result);
}
