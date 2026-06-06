/**
 * GET  /api/ops/brand-identity/subject-style-examples?siteId=<uuid>
 * POST /api/ops/brand-identity/subject-style-examples { siteId }
 *
 * Operator-authed.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import {
  generateSubjectStyleExamples,
  readSubjectStyleExamples,
} from "@/lib/brand-identity/subject-style-generator";

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const siteId = req.nextUrl.searchParams.get("siteId");
  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }
  const payload = await readSubjectStyleExamples(siteId);
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
  const result = await generateSubjectStyleExamples({ businessId: siteId });
  return NextResponse.json(result);
}
