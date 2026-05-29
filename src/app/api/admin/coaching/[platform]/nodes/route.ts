/**
 * POST /api/admin/coaching/[platform]/nodes
 *   Body: { id, type, content, position? }
 *   Creates a new node. Fails if the id collides with an existing node
 *   on this platform.
 */
import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { sql } from "@/lib/db";
import type { PlatformKey } from "@/lib/onboarding/coaching/types";

const PLATFORMS: PlatformKey[] = [
  "meta",
  "gbp",
  "linkedin",
  "youtube",
  "pinterest",
  "tiktok",
  "twitter",
];

const NODE_TYPES = new Set(["question", "instruction", "terminal"]);

interface PostBody {
  id?: string;
  type?: string;
  content?: Record<string, unknown>;
  position?: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!await isAdminRequest(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform } = await params;
  if (!PLATFORMS.includes(platform as PlatformKey)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as PostBody;

  if (!body.id || !/^[a-z0-9_]+$/.test(body.id)) {
    return NextResponse.json(
      { error: "id required (lowercase a-z, 0-9, underscore)" },
      { status: 400 }
    );
  }
  if (!body.type || !NODE_TYPES.has(body.type)) {
    return NextResponse.json(
      { error: "type must be question | instruction | terminal" },
      { status: 400 }
    );
  }

  const [existing] = await sql`
    SELECT id FROM coaching_nodes WHERE platform = ${platform} AND id = ${body.id}
  `;
  if (existing) {
    return NextResponse.json(
      { error: `Node "${body.id}" already exists on this platform` },
      { status: 409 }
    );
  }

  const [maxPos] = (await sql`
    SELECT COALESCE(MAX(position), 0)::int AS max_position
    FROM coaching_nodes WHERE platform = ${platform}
  `) as unknown as Array<{ max_position: number }>;

  const position = body.position ?? maxPos.max_position + 10;
  const content = body.content ?? defaultContentFor(body.type);

  await sql`
    INSERT INTO coaching_nodes (platform, id, type, content, position)
    VALUES (${platform}, ${body.id}, ${body.type}, ${JSON.stringify(content)}::jsonb, ${position})
  `;

  return NextResponse.json({ ok: true, id: body.id, position });
}

function defaultContentFor(type: string): Record<string, unknown> {
  if (type === "question") {
    return { question: "New question?", options: [] };
  }
  if (type === "instruction") {
    return { title: "New step", body: "", next: "" };
  }
  return { title: "Done", body: "", action: "done" };
}
