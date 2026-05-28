/**
 * Per-platform coaching content editor. Server fetches the walkthrough
 * + per-node analytics, then hands off to the client component for
 * accordion-based editing.
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { CoachingEditor, type EditorNode, type EditorWalkthrough } from "./coaching-editor";
import type { PlatformKey } from "@/lib/onboarding/coaching/types";

export const dynamic = "force-dynamic";

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
  id: string;
  type: "question" | "instruction" | "terminal";
  content: Record<string, unknown>;
  position: number;
}

export default async function CoachingPlatformPage({
  params,
}: {
  params: Promise<{ platform: string }>;
}) {
  const { platform } = await params;
  if (!PLATFORMS.includes(platform as PlatformKey)) notFound();

  const [meta] = (await sql`
    SELECT platform, title, subtitle, estimated_time, start_node_id
    FROM coaching_walkthroughs
    WHERE platform = ${platform}
  `) as unknown as WalkthroughRow[];

  if (!meta) {
    return (
      <div className="mx-auto max-w-3xl">
        <Link href="/admin/coaching" className="text-xs text-accent hover:underline">
          ← Back to coaching content
        </Link>
        <h1 className="mt-4">No content seeded for {platform}</h1>
        <p className="mt-2 text-sm text-muted">
          Run <code>node scripts/seed-coaching.js {platform}</code> to seed factory defaults,
          then return here to edit.
        </p>
      </div>
    );
  }

  const nodeRows = (await sql`
    SELECT id, type, content, position
    FROM coaching_nodes
    WHERE platform = ${platform}
    ORDER BY position ASC, id ASC
  `) as unknown as NodeRow[];

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
  for (const v of visits) analytics[v.node_id] = { visits: v.visits, lastSeen: 0 };
  for (const l of lastSeen) {
    analytics[l.node_id] = {
      visits: analytics[l.node_id]?.visits ?? 0,
      lastSeen: l.last_seen,
    };
  }

  const walkthrough: EditorWalkthrough = {
    platform: meta.platform,
    title: meta.title,
    subtitle: meta.subtitle,
    estimated_time: meta.estimated_time,
    start_node_id: meta.start_node_id,
  };

  const nodes: EditorNode[] = nodeRows.map((n) => ({
    id: n.id,
    type: n.type,
    content: n.content,
    position: n.position,
  }));

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/admin/coaching" className="text-xs text-accent hover:underline">
        ← Back to coaching content
      </Link>
      <CoachingEditor
        platform={platform}
        initialWalkthrough={walkthrough}
        initialNodes={nodes}
        analytics={analytics}
      />
    </div>
  );
}
