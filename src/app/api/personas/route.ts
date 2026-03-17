import { NextRequest, NextResponse } from "next/server";
import { listPersonas, createPersona } from "@/lib/personas";
import type { CreatePersonaInput } from "@/lib/personas";

/**
 * GET /api/personas?site_id=xxx
 * List all personas for a site.
 */
export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get("site_id");
  if (!siteId) {
    return NextResponse.json({ error: "site_id required" }, { status: 400 });
  }

  const personas = await listPersonas(siteId);
  return NextResponse.json({ personas });
}

/**
 * POST /api/personas
 * Create a new persona for a site.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { site_id, ...input } = body as { site_id: string } & CreatePersonaInput;

  if (!site_id || !input.name || !input.type) {
    return NextResponse.json(
      { error: "site_id, name, and type are required" },
      { status: 400 }
    );
  }

  const validTypes = ["pet", "person", "place", "product"];
  if (!validTypes.includes(input.type)) {
    return NextResponse.json(
      { error: `type must be one of: ${validTypes.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const persona = await createPersona(site_id, input);
    return NextResponse.json({ persona }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("idx_personas_site_name")) {
      return NextResponse.json(
        { error: "A character with that name already exists for this site" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
