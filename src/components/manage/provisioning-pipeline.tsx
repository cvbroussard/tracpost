"use client";

import { useState, useEffect } from "react";

interface Task {
  task_key: string;
  title: string;
  owner: string;
  depends_on: string[];
  status: string;
  milestone: string | null;
  sort_order: number;
  started_at: string | null;
  completed_at: string | null;
  notes: string | null;
}

const STATUS_STYLES: Record<string, { dot: string; bg: string; text: string; label: string }> = {
  complete: { dot: "bg-success", bg: "bg-success/10", text: "text-success", label: "Complete" },
  in_progress: { dot: "bg-accent", bg: "bg-accent/10", text: "text-accent", label: "In Progress" },
  blocked: { dot: "bg-danger", bg: "bg-danger/10", text: "text-danger", label: "Blocked" },
  pending: { dot: "bg-muted", bg: "bg-surface-hover", text: "text-muted", label: "Pending" },
};

export function ProvisioningPipeline({ subscriberId }: { subscriberId: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

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

  async function updateStatus(taskKey: string, status: string) {
    await fetch("/api/manage/provisioning", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscriber_id: subscriberId, task_key: taskKey, status }),
    });
    // Refresh
    const res = await fetch(`/api/manage/provisioning?subscriber_id=${subscriberId}`);
    if (res.ok) {
      const data = await res.json();
      setTasks(data.tasks);
      setCompletedCount(data.completedCount);
      setTotalCount(data.totalCount);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="p-4 space-y-4">
      {/* Progress bar */}
      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Provisioning Pipeline</h3>
          <span className="text-xs text-muted">{completedCount}/{totalCount} tasks · {progressPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-surface-hover overflow-hidden">
          <div
            className="h-full rounded-full bg-success transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Task pipeline */}
      <div className="rounded-xl border border-border bg-surface shadow-card overflow-hidden">
        {tasks.map((task, i) => {
          const style = STATUS_STYLES[task.status] || STATUS_STYLES.pending;
          const isBlocked = task.depends_on.length > 0 &&
            task.depends_on.some(dep => {
              const depTask = tasks.find(t => t.task_key === dep);
              return depTask && depTask.status !== "complete";
            }) && task.status === "pending";

          const effectiveStyle = isBlocked ? STATUS_STYLES.blocked : style;

          return (
            <div
              key={task.task_key}
              className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-0 ${
                task.status === "complete" ? "opacity-60" : ""
              }`}
            >
              {/* Connection line + dot */}
              <div className="flex flex-col items-center w-6 shrink-0">
                {i > 0 && <div className="w-px h-2 bg-border -mt-3" />}
                <div className={`w-3 h-3 rounded-full ${effectiveStyle.dot} ${
                  task.status === "in_progress" ? "ring-2 ring-accent/30" : ""
                }`} />
                {i < tasks.length - 1 && <div className="w-px h-2 bg-border -mb-3" />}
              </div>

              {/* Task info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${task.status === "complete" ? "line-through" : ""}`}>
                    {task.title}
                  </span>
                  {task.milestone && task.status === "complete" && (
                    <span className="rounded bg-success/10 px-1.5 py-0.5 text-[9px] font-medium text-success">
                      ✦ {task.milestone}
                    </span>
                  )}
                  {task.milestone && task.status !== "complete" && (
                    <span className="rounded bg-surface-hover px-1.5 py-0.5 text-[9px] text-muted">
                      → {task.milestone}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                    task.owner === "tenant" ? "bg-warning/10 text-warning" : "bg-accent/10 text-accent"
                  }`}>
                    {task.owner}
                  </span>
                  {task.depends_on.length > 0 && (
                    <span className="text-[9px] text-muted">
                      needs: {task.depends_on.join(", ")}
                    </span>
                  )}
                  {task.completed_at && (
                    <span className="text-[9px] text-muted">
                      {new Date(task.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </div>
              </div>

              {/* Status + action */}
              <div className="flex items-center gap-2 shrink-0">
                <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${effectiveStyle.bg} ${effectiveStyle.text}`}>
                  {isBlocked ? "Blocked" : effectiveStyle.label}
                </span>
                {task.status !== "complete" && !isBlocked && (
                  <select
                    value=""
                    onChange={e => { if (e.target.value) updateStatus(task.task_key, e.target.value); }}
                    className="rounded border border-border bg-background px-1 py-0.5 text-[10px]"
                  >
                    <option value="">...</option>
                    {task.status !== "in_progress" && <option value="in_progress">Start</option>}
                    <option value="complete">Complete</option>
                  </select>
                )}
                {task.status === "complete" && (
                  <button
                    onClick={() => updateStatus(task.task_key, "pending")}
                    className="text-[9px] text-muted hover:text-foreground"
                  >
                    undo
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
