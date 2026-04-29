/**
 * GET  /api/onboarding/[token]/coaching/[platform]
 *   → returns { walkthrough, progress }
 *     walkthrough: full graph from coaching_walkthroughs + coaching_nodes
 *     progress: user's current node + path_taken (resume support)
 *
 * POST /api/onboarding/[token]/coaching/[platform]
 *   Body: { node_id, action: "navigate" | "complete" | "abandon" }
 *   → updates coaching_progress for this (subscription, platform)
 *
 * Token-authorized (no session). Mirrors the rest of the onboarding API.
 */
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getByToken } from "@/lib/onboarding/queries";
import { loadWalkthrough } from "@/lib/onboarding/coaching/engine";
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string; platform: string }> }
) {
  const { token, platform } = await params;

  if (!PLATFORMS.includes(platform as PlatformKey)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  }

  const submission = await getByToken(token);
  if (!submission) {
    return NextResponse.json({ error: "Invalid onboarding token" }, { status: 404 });
  }

  const walkthrough = await loadWalkthrough(platform as PlatformKey);
  if (!walkthrough) {
    return NextResponse.json(
      { error: `No coaching content seeded for ${platform}` },
      { status: 404 }
    );
  }

  const [progress] = await sql`
    SELECT last_node_id, path_taken, reached_terminal, completed_at
    FROM coaching_progress
    WHERE subscription_id = ${submission.subscription_id} AND platform = ${platform}
  `;

  return NextResponse.json({
    walkthrough,
    progress: progress
      ? {
          last_node_id: progress.last_node_id,
          path_taken: progress.path_taken,
          reached_terminal: progress.reached_terminal,
          completed_at: progress.completed_at,
        }
      : null,
  });
}

interface PostBody {
  node_id?: string;
  action?: "navigate" | "complete" | "abandon";
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string; platform: string }> }
) {
  const { token, platform } = await params;

  if (!PLATFORMS.includes(platform as PlatformKey)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 404 });
  }

  const submission = await getByToken(token);
  if (!submission) {
    return NextResponse.json({ error: "Invalid onboarding token" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as PostBody;
  const { node_id, action = "navigate" } = body;

  if (!node_id) {
    return NextResponse.json({ error: "node_id required" }, { status: 400 });
  }

  const reachedTerminal = action === "complete";
  const completedAt = action === "complete" ? new Date().toISOString() : null;

  await sql`
    INSERT INTO coaching_progress (
      subscription_id, platform, last_node_id, path_taken, reached_terminal, completed_at
    ) VALUES (
      ${submission.subscription_id},
      ${platform},
      ${node_id},
      ARRAY[${node_id}::TEXT],
      ${reachedTerminal},
      ${completedAt}
    )
    ON CONFLICT (subscription_id, platform) DO UPDATE SET
      last_node_id     = EXCLUDED.last_node_id,
      path_taken       = array_append(coaching_progress.path_taken, EXCLUDED.last_node_id),
      reached_terminal = coaching_progress.reached_terminal OR EXCLUDED.reached_terminal,
      completed_at     = COALESCE(coaching_progress.completed_at, EXCLUDED.completed_at),
      updated_at       = NOW()
  `;

  return NextResponse.json({ ok: true, action });
}
