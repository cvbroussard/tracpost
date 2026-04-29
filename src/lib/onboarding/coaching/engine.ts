/**
 * Coaching graph engine — DB-driven loader + traversal helpers.
 *
 * Content lives in coaching_walkthroughs + coaching_nodes (migration 064).
 * Operator can edit DB rows live; next call to loadWalkthrough() picks up
 * the change. Initial content is seeded via scripts/seed-coaching-*.js,
 * which insert from per-platform "factory default" definitions.
 */
import "server-only";
import { sql } from "@/lib/db";
import type {
  PlatformWalkthrough,
  PlatformKey,
  WalkthroughNode,
  QuestionNode,
  InstructionNode,
  TerminalNode,
} from "./types";

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

/**
 * Load a platform walkthrough from the database. Returns null if the
 * platform has no seeded content.
 */
export async function loadWalkthrough(
  platform: PlatformKey
): Promise<PlatformWalkthrough | null> {
  const [meta] = await sql`
    SELECT platform, title, subtitle, estimated_time, start_node_id
    FROM coaching_walkthroughs
    WHERE platform = ${platform}
  ` as unknown as WalkthroughRow[];

  if (!meta) return null;

  const nodes = (await sql`
    SELECT platform, id, type, content, position
    FROM coaching_nodes
    WHERE platform = ${platform}
    ORDER BY position ASC, id ASC
  `) as unknown as NodeRow[];

  const nodeMap: Record<string, WalkthroughNode> = {};
  for (const row of nodes) {
    nodeMap[row.id] = nodeFromRow(row);
  }

  return {
    platform: platform,
    title: meta.title,
    subtitle: meta.subtitle || undefined,
    estimated_time: meta.estimated_time || undefined,
    start: meta.start_node_id,
    nodes: nodeMap,
  };
}

function nodeFromRow(row: NodeRow): WalkthroughNode {
  const c = row.content;
  if (row.type === "question") {
    return {
      type: "question",
      id: row.id,
      question: String(c.question || ""),
      help: c.help ? String(c.help) : undefined,
      options: Array.isArray(c.options) ? (c.options as unknown[]).map((o) => {
        const opt = o as Record<string, unknown>;
        return {
          label: String(opt.label || ""),
          next: String(opt.next || ""),
          hint: opt.hint ? String(opt.hint) : undefined,
        };
      }) : [],
    } as QuestionNode;
  }
  if (row.type === "instruction") {
    return {
      type: "instruction",
      id: row.id,
      title: String(c.title || ""),
      body: String(c.body || ""),
      deep_link: c.deep_link ? String(c.deep_link) : undefined,
      deep_link_label: c.deep_link_label ? String(c.deep_link_label) : undefined,
      screenshot: c.screenshot ? String(c.screenshot) : undefined,
      screenshot_alt: c.screenshot_alt ? String(c.screenshot_alt) : undefined,
      bullets: Array.isArray(c.bullets) ? (c.bullets as unknown[]).map(String) : undefined,
      next: String(c.next || ""),
    } as InstructionNode;
  }
  // terminal
  return {
    type: "terminal",
    id: row.id,
    title: String(c.title || ""),
    body: String(c.body || ""),
    action: (c.action as "connect" | "done") || "done",
    action_label: c.action_label ? String(c.action_label) : undefined,
  } as TerminalNode;
}

/**
 * Validate a walkthrough graph: every transition resolves, no orphans,
 * at least one terminal reachable. Useful at seed time and in tests.
 */
export function validateWalkthrough(w: PlatformWalkthrough): string[] {
  const errors: string[] = [];
  const ids = new Set(Object.keys(w.nodes));

  if (!ids.has(w.start)) {
    errors.push(`start node "${w.start}" does not exist`);
  }

  for (const [id, node] of Object.entries(w.nodes)) {
    if (node.id !== id) {
      errors.push(`node id mismatch: key "${id}" but node.id "${node.id}"`);
    }
    if (node.type === "question") {
      if (node.options.length === 0) {
        errors.push(`question node "${id}" has no options`);
      }
      for (const opt of node.options) {
        if (!ids.has(opt.next)) {
          errors.push(`question "${id}" option "${opt.label}" → unknown node "${opt.next}"`);
        }
      }
    } else if (node.type === "instruction") {
      if (!ids.has(node.next)) {
        errors.push(`instruction "${id}" → unknown next "${node.next}"`);
      }
    }
  }

  // Reachability + terminal presence
  const reachable = new Set<string>([w.start]);
  const queue: string[] = [w.start];
  let hasTerminal = false;
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = w.nodes[id];
    if (!node) continue;
    if (node.type === "terminal") hasTerminal = true;
    const nexts: string[] =
      node.type === "question"
        ? node.options.map((o) => o.next)
        : node.type === "instruction"
        ? [node.next]
        : [];
    for (const n of nexts) {
      if (!reachable.has(n)) {
        reachable.add(n);
        queue.push(n);
      }
    }
  }

  for (const id of ids) {
    if (!reachable.has(id)) {
      errors.push(`orphaned node "${id}" (not reachable from start)`);
    }
  }
  if (!hasTerminal) {
    errors.push("graph has no reachable terminal node");
  }

  return errors;
}

/**
 * Compute progress percent through a walkthrough based on which node the
 * user is currently on. Approximate — uses node depth from start.
 * Terminal = 100%.
 */
export function progressPercent(
  walkthrough: PlatformWalkthrough,
  currentNodeId: string
): number {
  const current = walkthrough.nodes[currentNodeId];
  if (!current) return 0;
  if (current.type === "terminal") return 100;

  const depth = nodeDepth(walkthrough, currentNodeId);
  const maxDepth = maxGraphDepth(walkthrough);
  if (maxDepth === 0) return 0;
  return Math.min(95, Math.round((depth / maxDepth) * 95));
}

function nodeDepth(w: PlatformWalkthrough, target: string): number {
  if (w.start === target) return 0;
  const visited = new Set<string>([w.start]);
  const queue: Array<[string, number]> = [[w.start, 0]];
  while (queue.length > 0) {
    const [id, d] = queue.shift()!;
    const node = w.nodes[id];
    if (!node) continue;
    const nexts =
      node.type === "question"
        ? node.options.map((o) => o.next)
        : node.type === "instruction"
        ? [node.next]
        : [];
    for (const n of nexts) {
      if (n === target) return d + 1;
      if (!visited.has(n)) {
        visited.add(n);
        queue.push([n, d + 1]);
      }
    }
  }
  return 0;
}

function maxGraphDepth(w: PlatformWalkthrough): number {
  let max = 0;
  const visited = new Set<string>([w.start]);
  const queue: Array<[string, number]> = [[w.start, 0]];
  while (queue.length > 0) {
    const [id, d] = queue.shift()!;
    if (d > max) max = d;
    const node = w.nodes[id];
    if (!node) continue;
    const nexts =
      node.type === "question"
        ? node.options.map((o) => o.next)
        : node.type === "instruction"
        ? [node.next]
        : [];
    for (const n of nexts) {
      if (!visited.has(n)) {
        visited.add(n);
        queue.push([n, d + 1]);
      }
    }
  }
  return max;
}
