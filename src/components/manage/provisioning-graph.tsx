"use client";

import { useState, useEffect, useMemo } from "react";

interface Task {
  task_key: string;
  title: string;
  owner: string;
  depends_on: string[];
  status: string;
  milestone: string | null;
  step_label: string | null;
  completed_at: string | null;
}

const OWNER_COLORS = {
  platform: { fill: "#3b82f6", bg: "#dbeafe", stroke: "#2563eb" },
  tenant: { fill: "#f59e0b", bg: "#fef3c7", stroke: "#d97706" },
};

const STATUS_FILLS: Record<string, string> = {
  complete: "#22c55e",
  in_progress: "#3b82f6",
  blocked: "#ef4444",
  pending: "#d1d5db",
};

interface NodePos {
  task: Task;
  x: number;
  y: number;
  col: number;
  row: number;
}

export function ProvisioningGraph({ subscriberId }: { subscriberId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/manage/provisioning?subscriber_id=${subscriberId}`)
      .then(r => r.ok ? r.json() : { tasks: [] })
      .then(data => {
        setTasks(data.tasks || []);
        setCompletedCount(data.completedCount || 0);
        setTotalCount(data.totalCount || 0);
      })
      .finally(() => setLoading(false));
  }, [subscriberId]);

  async function toggleStatus(taskKey: string, currentStatus: string) {
    const newStatus = currentStatus === "complete" ? "pending" : "complete";
    await fetch("/api/manage/provisioning", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriber_id: subscriberId, task_key: taskKey, status: newStatus }),
    });
    const res = await fetch(`/api/manage/provisioning?subscriber_id=${subscriberId}`);
    if (res.ok) {
      const data = await res.json();
      setTasks(data.tasks);
      setCompletedCount(data.completedCount);
      setTotalCount(data.totalCount);
    }
  }

  // Compute graph layout from dependency data
  const { nodes, edges, width, height } = useMemo(() => {
    if (tasks.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };

    const taskMap = new Map(tasks.map(t => [t.task_key, t]));

    // Calculate depth (column) for each task
    const depths = new Map<string, number>();
    function getDepth(key: string): number {
      if (depths.has(key)) return depths.get(key)!;
      const task = taskMap.get(key);
      if (!task || task.depends_on.length === 0) {
        depths.set(key, 0);
        return 0;
      }
      const maxParent = Math.max(...task.depends_on.map(d => getDepth(d)));
      const depth = maxParent + 1;
      depths.set(key, depth);
      return depth;
    }
    tasks.forEach(t => getDepth(t.task_key));

    // Group by column
    const columns = new Map<number, Task[]>();
    tasks.forEach(t => {
      const col = depths.get(t.task_key) || 0;
      if (!columns.has(col)) columns.set(col, []);
      columns.get(col)!.push(t);
    });

    const NODE_W = 120;
    const NODE_H = 50;
    const COL_GAP = 60;
    const ROW_GAP = 30;
    const PAD_X = 60;
    const PAD_Y = 40;
    const RADIUS = 20;

    const maxCol = Math.max(...Array.from(columns.keys()));
    const maxRows = Math.max(...Array.from(columns.values()).map(c => c.length));

    const nodePositions: NodePos[] = [];
    const nodeMap = new Map<string, NodePos>();

    for (const [col, colTasks] of columns) {
      colTasks.forEach((task, row) => {
        const x = PAD_X + col * (NODE_W + COL_GAP) + NODE_W / 2;
        const y = PAD_Y + row * (NODE_H + ROW_GAP) + NODE_H / 2;
        const pos: NodePos = { task, x, y, col, row };
        nodePositions.push(pos);
        nodeMap.set(task.task_key, pos);
      });
    }

    // Build edges
    const edgeList: Array<{ from: NodePos; to: NodePos }> = [];
    for (const node of nodePositions) {
      for (const dep of node.task.depends_on) {
        const fromNode = nodeMap.get(dep);
        if (fromNode) edgeList.push({ from: fromNode, to: node });
      }
    }

    const svgWidth = PAD_X * 2 + (maxCol + 1) * (NODE_W + COL_GAP) - COL_GAP;
    const svgHeight = PAD_Y * 2 + maxRows * (NODE_H + ROW_GAP) - ROW_GAP;

    return { nodes: nodePositions, edges: edgeList, width: svgWidth, height: svgHeight };
  }, [tasks]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const hoveredTask = hovered ? tasks.find(t => t.task_key === hovered) : null;

  return (
    <div className="p-4 space-y-4">
      {/* Progress bar */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Provisioning Pipeline</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: OWNER_COLORS.platform.fill }} />
              <span className="text-muted">Platform</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: OWNER_COLORS.tenant.fill }} />
              <span className="text-muted">Tenant</span>
            </div>
            <span className="text-xs text-muted">{completedCount}/{totalCount} · {progressPct}%</span>
          </div>
        </div>
        <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
          <div className="h-full rounded-full bg-success transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {/* Graph */}
      <div className="rounded-xl border border-border bg-surface shadow-card overflow-x-auto">
        <svg width={width} height={height} className="block">
          {/* Start / Finish labels */}
          <text x={20} y={height / 2} fill="currentColor" fontSize={11} opacity={0.3} fontWeight={500}>Start</text>
          <text x={width - 20} y={height / 2} fill="currentColor" fontSize={11} opacity={0.3} fontWeight={500} textAnchor="end">Finish</text>

          {/* Edges */}
          {edges.map((edge, i) => {
            const r = 20;
            return (
              <line
                key={i}
                x1={edge.from.x + r}
                y1={edge.from.y}
                x2={edge.to.x - r}
                y2={edge.to.y}
                stroke="currentColor"
                strokeOpacity={0.15}
                strokeWidth={1.5}
                markerEnd="url(#arrow)"
              />
            );
          })}

          {/* Arrow marker */}
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" opacity={0.2} />
            </marker>
          </defs>

          {/* Nodes */}
          {nodes.map(node => {
            const t = node.task;
            const ownerColor = OWNER_COLORS[t.owner as keyof typeof OWNER_COLORS] || OWNER_COLORS.platform;
            const isComplete = t.status === "complete";
            const isBlocked = t.status === "pending" && t.depends_on.some(dep => {
              const depTask = tasks.find(dt => dt.task_key === dep);
              return depTask && depTask.status !== "complete";
            });
            const statusColor = isBlocked ? STATUS_FILLS.blocked : STATUS_FILLS[t.status] || STATUS_FILLS.pending;
            const isHovered = hovered === t.task_key;

            return (
              <g
                key={t.task_key}
                className="cursor-pointer"
                onMouseEnter={() => setHovered(t.task_key)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => toggleStatus(t.task_key, t.status)}
              >
                {/* Outer ring — owner color */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isHovered ? 22 : 20}
                  fill={ownerColor.bg}
                  stroke={ownerColor.stroke}
                  strokeWidth={isHovered ? 2.5 : 1.5}
                  opacity={isComplete ? 0.6 : 1}
                />

                {/* Inner fill — status */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={12}
                  fill={statusColor}
                  opacity={isComplete ? 0.8 : 0.6}
                />

                {/* Step label */}
                <text
                  x={node.x}
                  y={node.y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#fff"
                  fontSize={11}
                  fontWeight={600}
                >
                  {isComplete ? "✓" : t.step_label || ""}
                </text>

                {/* Title below */}
                <text
                  x={node.x}
                  y={node.y + 30}
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize={9}
                  opacity={isComplete ? 0.4 : 0.7}
                >
                  {t.title.length > 18 ? t.title.slice(0, 16) + "…" : t.title}
                </text>

                {/* Milestone diamond */}
                {t.milestone && isComplete && (
                  <polygon
                    points={`${node.x},${node.y - 28} ${node.x + 5},${node.y - 23} ${node.x},${node.y - 18} ${node.x - 5},${node.y - 23}`}
                    fill="#22c55e"
                  />
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover tooltip */}
        {hoveredTask && (
          <div className="px-4 py-3 border-t border-border bg-surface-hover">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium">{hoveredTask.step_label}. {hoveredTask.title}</span>
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                hoveredTask.owner === "tenant" ? "bg-warning/10 text-warning" : "bg-accent/10 text-accent"
              }`}>{hoveredTask.owner}</span>
              {hoveredTask.milestone && (
                <span className="rounded bg-success/10 px-1.5 py-0.5 text-[9px] text-success">→ {hoveredTask.milestone}</span>
              )}
              {hoveredTask.completed_at && (
                <span className="text-[9px] text-muted">
                  {new Date(hoveredTask.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
              <span className="text-[9px] text-muted ml-auto">Click to toggle status</span>
            </div>
            {hoveredTask.depends_on.length > 0 && (
              <p className="text-[9px] text-muted mt-1">Depends on: {hoveredTask.depends_on.join(", ")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
