import { isAdminRequest } from "@/lib/admin-session";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { recomputeBrandExtractionStatus } from "@/lib/provisioning/brand-extraction-status";

/**
 * GET /api/ops/provisioning?subscriber_id=xxx[&site_id=yyy]
 * Returns provisioning task pipeline for a subscriber.
 *
 * Brand Extraction sub_task + task statuses are recomputed from
 * catalog / substrate / CMA / readiness-resolution state on every load.
 * Sub-task table is DERIVED — recompute is the single source of truth.
 *
 * Business resolution: if `site_id` is supplied, recompute targets that
 * business directly (matches what the operator selected in the manage
 * shell). Otherwise falls back to the subscriber's earliest-created
 * active business. The fallback is wrong for multi-business subscriptions
 * — callers should pass site_id whenever they have one.
 */
export async function GET(req: NextRequest) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const subscriberId = url.searchParams.get("subscriber_id");
  const explicitSiteId = url.searchParams.get("site_id");
  if (!subscriberId) return NextResponse.json({ error: "subscriber_id required" }, { status: 400 });

  // Resolve which business to recompute. Prefer the explicit site_id from
  // the manage shell; fall back to "earliest created" for callers that
  // didn't pass one. Non-fatal if recompute fails — we still serve whatever's
  // in the table.
  let businessId: string | null = null;
  if (explicitSiteId && explicitSiteId !== "all") {
    // Validate it belongs to this subscriber
    const [row] = await sql`
      SELECT id FROM businesses
      WHERE id = ${explicitSiteId} AND billing_account_id = ${subscriberId} AND is_active = true
      LIMIT 1
    `;
    businessId = row ? (row.id as string) : null;
  }
  if (!businessId) {
    const [siteRow] = await sql`
      SELECT id FROM businesses
      WHERE billing_account_id = ${subscriberId} AND is_active = true
      ORDER BY created_at ASC LIMIT 1
    `;
    businessId = siteRow ? (siteRow.id as string) : null;
  }
  let staleTasks: Record<string, boolean> = {};
  if (businessId) {
    try {
      const result = await recomputeBrandExtractionStatus(businessId);
      staleTasks = result.staleTasks;
    } catch (e) {
      console.error("brand extraction recompute failed:", e);
    }
  }

  const tasks = await sql`
    SELECT id, task_key, title, owner, depends_on, status, milestone,
           sort_order, step_label, started_at, completed_at, notes
    FROM provisioning_tasks
    WHERE billing_account_id = ${subscriberId}
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

  // Enrich tasks with sub-task info + staleness flag.
  // stale = true means the task's output is no longer current relative
  // to its upstream — surfaces as an amber ⚠ corner badge on the card.
  const enriched = tasks.map(t => {
    const subs = subByTask.get(t.id as string) || [];
    const subTotal = subs.length;
    const subComplete = subs.filter(s => s.status === "complete").length;
    return {
      ...t,
      subTasks: subs,
      subTotal,
      subComplete,
      stale: !!staleTasks[t.task_key as string],
    };
  });


  const completedCount = enriched.filter(t => (t as Record<string, unknown>).status === "complete").length;
  const totalCount = enriched.length;

  return NextResponse.json({ tasks: enriched, completedCount, totalCount, businessId });
}

/**
 * PATCH /api/ops/provisioning
 * Body: { subscriber_id, task_key, status, notes? }
 * Updates a task's status.
 */
export async function PATCH(req: NextRequest) {
  if (!(await isAdminRequest())) {
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
    WHERE billing_account_id = ${subscriber_id} AND task_key = ${task_key}
  `;

  return NextResponse.json({ success: true });
}
