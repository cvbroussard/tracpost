import { NextRequest, NextResponse } from "next/server";
import { getPersona, updatePersona, deletePersona, getPersonaAssets } from "@/lib/personas";
import type { UpdatePersonaInput } from "@/lib/personas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/personas/[id]?site_id=xxx
 * Get a single persona with its recent asset appearances.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const persona = await getPersona(siteId, id);
  if (!persona) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const assets = await getPersonaAssets(id, 12);
  return NextResponse.json({ persona, assets });
}

/**
 * PATCH /api/personas/[id]
 * Update a persona.
 */
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const body = await req.json();
  const { site_id, ...input } = body as { site_id: string } & UpdatePersonaInput;

  if (!site_id) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const persona = await updatePersona(site_id, id, input);
  if (!persona) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ persona });
}

/**
 * DELETE /api/personas/[id]?site_id=xxx
 * Delete a persona and all its asset links.
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const deleted = await deletePersona(siteId, id);
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
