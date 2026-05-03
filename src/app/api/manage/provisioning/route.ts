import { verifyCookie } from "@/lib/cookie-sign";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

/**
 * GET /api/manage/provisioning?subscriber_id=xxx
 * Returns provisioning task pipeline for a subscriber.
 */
export async function GET(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subscriberId = new URL(req.url).searchParams.get("subscriber_id");
  if (!subscriberId) return NextResponse.json({ error: "subscriber_id required" }, { status: 400 });

  const tasks = await sql`
    SELECT id, task_key, title, owner, depends_on, status, milestone,
           sort_order, step_label, started_at, completed_at, notes
    FROM provisioning_tasks
    WHERE subscription_id = ${subscriberId}
    ORDER BY sort_order ASC
  `;

  // Fetch sub-tasks for all tasks
  const taskIds = tasks.map(t => t.id as string);
  const subTasks = taskIds.length > 0 ? await sql`
    SELECT task_id, sub_key, title, status, completed_at, sort_order
    FROM provisioning_sub_tasks
    WHERE task_id = ANY(${taskIds})
    ORDER BY sort_order ASC
  ` : [];

  // Group sub-tasks by task_id
  const subByTask = new Map<string, Array<Record<string, unknown>>>();
  for (const st of subTasks) {
    const tid = st.task_id as string;
    if (!subByTask.has(tid)) subByTask.set(tid, []);
    subByTask.get(tid)!.push(st);
  }

  // Enrich tasks with sub-task info
  const enriched = tasks.map(t => {
    const subs = subByTask.get(t.id as string) || [];
    const subTotal = subs.length;
    const subComplete = subs.filter(s => s.status === "complete").length;
    return {
      ...t,
      subTasks: subs,
      subTotal,
      subComplete,
    };
  });

  const completedCount = enriched.filter(t => (t as Record<string, unknown>).status === "complete").length;
  const totalCount = enriched.length;

  return NextResponse.json({ tasks: enriched, completedCount, totalCount });
}

/**
 * PATCH /api/manage/provisioning
 * Body: { subscriber_id, task_key, status, notes? }
 * Updates a task's status.
 */
export async function PATCH(req: NextRequest) {
  const adminCookie = req.cookies.get("tp_admin")?.value;
  if (!verifyCookie(adminCookie)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { subscriber_id, task_key, status, notes } = await req.json();
  if (!subscriber_id || !task_key || !status) {
    return NextResponse.json({ error: "subscriber_id, task_key, and status required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const startedAt = status === "in_progress" ? now : undefined;
  const completedAt = status === "complete" ? now : undefined;

  await sql`
    UPDATE provisioning_tasks SET
      status = ${status},
      started_at = COALESCE(${startedAt || null}, started_at),
      completed_at = ${completedAt || null},
      notes = COALESCE(${notes || null}, notes)
    WHERE subscription_id = ${subscriber_id} AND task_key = ${task_key}
  `;

  return NextResponse.json({ success: true });
}
