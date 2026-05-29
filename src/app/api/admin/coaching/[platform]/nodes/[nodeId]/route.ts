/**
 * PUT  /api/admin/coaching/[platform]/nodes/[nodeId]
 *   Body: { content?, position?, type? }
 *   Replace the JSONB content (or change position/type) of a node.
 *
 * DELETE /api/admin/coaching/[platform]/nodes/[nodeId]
 *   Refuse if any other node references this one (incoming edges).
 *   Refuse if this is the walkthrough's start node.
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

interface PutBody {
  content?: Record<string, unknown>;
  position?: number;
  type?: string;
}

interface NodeRow {
  id: string;
  type: string;
  content: Record<string, unknown>;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string; nodeId: string }> }
) {
  if (!await isAdminRequest()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform, nodeId } = await params;
  if (!PLATFORMS.includes(platform as PlatformKey)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as PutBody;

  const [existing] = (await sql`
    SELECT id, type, content FROM coaching_nodes
    WHERE platform = ${platform} AND id = ${nodeId}
  `) as unknown as NodeRow[];

  if (!existing) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  if (body.type && !NODE_TYPES.has(body.type)) {
    return NextResponse.json(
      { error: "type must be question | instruction | terminal" },
      { status: 400 }
    );
  }

  const nextContent = body.content ?? existing.content;
  const nextType = body.type ?? existing.type;

  if (typeof body.position === "number") {
    await sql`
      UPDATE coaching_nodes
      SET content = ${JSON.stringify(nextContent)}::jsonb,
          type = ${nextType},
          position = ${body.position},
          updated_at = NOW()
      WHERE platform = ${platform} AND id = ${nodeId}
    `;
  } else {
    await sql`
      UPDATE coaching_nodes
      SET content = ${JSON.stringify(nextContent)}::jsonb,
          type = ${nextType},
          updated_at = NOW()
      WHERE platform = ${platform} AND id = ${nodeId}
    `;
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string; nodeId: string }> }
) {
  if (!await isAdminRequest()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform, nodeId } = await params;
  if (!PLATFORMS.includes(platform as PlatformKey)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  }

  // Refuse if this is the walkthrough's start node.
  const [walkthrough] = (await sql`
    SELECT start_node_id FROM coaching_walkthroughs WHERE platform = ${platform}
  `) as unknown as Array<{ start_node_id: string }>;
  if (walkthrough && walkthrough.start_node_id === nodeId) {
    return NextResponse.json(
      { error: "Cannot delete the start node. Change the walkthrough's start first." },
      { status: 409 }
    );
  }

  // Find any other node that references this one through its content
  // (question.options[].next, instruction.next). Scan all nodes and
  // walk JSONB; the dataset per platform is small (<50 nodes).
  const others = (await sql`
    SELECT id, type, content FROM coaching_nodes
    WHERE platform = ${platform} AND id != ${nodeId}
  `) as unknown as NodeRow[];

  const referers: string[] = [];
  for (const n of others) {
    if (n.type === "instruction" && n.content?.next === nodeId) {
      referers.push(n.id);
    } else if (n.type === "question" && Array.isArray(n.content?.options)) {
      const opts = n.content.options as Array<{ next?: string }>;
      if (opts.some((o) => o.next === nodeId)) {
        referers.push(n.id);
      }
    }
  }

  if (referers.length > 0) {
    return NextResponse.json(
      {
        error: `Cannot delete: ${referers.length} other node(s) link to "${nodeId}". Update or remove those edges first.`,
        referers,
      },
      { status: 409 }
    );
  }

  await sql`
    DELETE FROM coaching_nodes
    WHERE platform = ${platform} AND id = ${nodeId}
  `;

  return NextResponse.json({ ok: true });
}
