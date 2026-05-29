/**
 * GET /api/admin/coaching/[platform]
 *   Returns the walkthrough graph + per-node analytics (visits, last-seen
 *   counts) for the operator editor. Includes raw `content` JSONB on each
 *   node so the editor can present every field, including legacy ones.
 *
 * Operator-gated via tp_admin cookie.
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

interface WalkthroughRow {
  platform: string;
  title: string;
  subtitle: string | null;
  estimated_time: string | null;
  start_node_id: string;
}

interface NodeRow {
  platform: string;
  id: string;
  type: "question" | "instruction" | "terminal";
  content: Record<string, unknown>;
  position: number;
}

interface AnalyticsRow {
  node_id: string;
  visits: number;
  last_seen: number;
}

export async function GET(
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

  const [meta] = (await sql`
    SELECT platform, title, subtitle, estimated_time, start_node_id
    FROM coaching_walkthroughs
    WHERE platform = ${platform}
  `) as unknown as WalkthroughRow[];

  if (!meta) {
    return NextResponse.json(
      { error: `No coaching content seeded for ${platform}` },
      { status: 404 }
    );
  }

  const nodes = (await sql`
    SELECT platform, id, type, content, position
    FROM coaching_nodes
    WHERE platform = ${platform}
    ORDER BY position ASC, id ASC
  `) as unknown as NodeRow[];

  // Per-node analytics: visits = count of subscriptions whose path_taken
  // contains the node; last_seen = subscriptions whose last_node_id is
  // this node (proxy for "stuck/abandoned here").
  const visits = (await sql`
    SELECT node_id::text AS node_id, COUNT(*)::int AS visits
    FROM (
      SELECT DISTINCT billing_account_id, unnest(path_taken) AS node_id
      FROM coaching_progress
      WHERE platform = ${platform}
    ) v
    GROUP BY node_id
  `) as unknown as Array<{ node_id: string; visits: number }>;

  const lastSeen = (await sql`
    SELECT last_node_id AS node_id, COUNT(*)::int AS last_seen
    FROM coaching_progress
    WHERE platform = ${platform}
    GROUP BY last_node_id
  `) as unknown as Array<{ node_id: string; last_seen: number }>;

  const analytics: Record<string, { visits: number; lastSeen: number }> = {};
  for (const v of visits) {
    analytics[v.node_id] = { visits: v.visits, lastSeen: 0 };
  }
  for (const l of lastSeen) {
    analytics[l.node_id] = {
      visits: analytics[l.node_id]?.visits ?? 0,
      lastSeen: l.last_seen,
    };
  }

  return NextResponse.json({
    walkthrough: {
      platform: meta.platform,
      title: meta.title,
      subtitle: meta.subtitle,
      estimated_time: meta.estimated_time,
      start_node_id: meta.start_node_id,
    },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      content: n.content,
      position: n.position,
    })),
    analytics,
  });
}

interface PutBody {
  title?: string | null;
  subtitle?: string | null;
  estimated_time?: string | null;
  start_node_id?: string;
}

/**
 * PUT /api/admin/coaching/[platform]
 *   Update walkthrough metadata (title, subtitle, estimated_time, start node).
 */
export async function PUT(
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

  const body = (await req.json().catch(() => ({}))) as PutBody;

  const [existing] = await sql`
    SELECT title, subtitle, estimated_time, start_node_id
    FROM coaching_walkthroughs WHERE platform = ${platform}
  ` as unknown as WalkthroughRow[];

  if (!existing) {
    return NextResponse.json({ error: "Walkthrough not found" }, { status: 404 });
  }

  const next = {
    title: body.title ?? existing.title,
    subtitle: body.subtitle === undefined ? existing.subtitle : body.subtitle,
    estimated_time:
      body.estimated_time === undefined
        ? existing.estimated_time
        : body.estimated_time,
    start_node_id: body.start_node_id ?? existing.start_node_id,
  };

  await sql`
    UPDATE coaching_walkthroughs
    SET title = ${next.title},
        subtitle = ${next.subtitle},
        estimated_time = ${next.estimated_time},
        start_node_id = ${next.start_node_id},
        updated_at = NOW()
    WHERE platform = ${platform}
  `;

  return NextResponse.json({ ok: true });
}
