/**
 * POST /api/admin/site-services/[siteId]/regenerate
 *
 * Runs the cluster-driven services pipeline end-to-end:
 *   1. Orchestrator (plan-only) — clusters CMA queries + derives services
 *   2. persistDerivedServices — full overwrite of 'auto' source services
 *   3. bindServicesToCategories — N:1 primary_gcid binding
 *
 * Destructive: replaces existing 'auto' services for the site. Caller
 * (UI) is expected to confirm before firing.
 *
 * Requires a completed CMA exists — throws if not.
 */
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { isAdminRequest } from "@/lib/admin-session";
import { runInfrastructurePipeline } from "@/lib/competitive-intel/pipeline-orchestrator";
import { persistDerivedServices } from "@/lib/services/derive";
import { bindServicesToCategories } from "@/lib/services/junction-bind";
import { checkCmaReadiness } from "@/lib/competitive-intel/category-coaching-runner";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ siteId: string }> },
) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { siteId } = await ctx.params;

  // Manual-before-autopilot: pre-check CMA readiness; surface blocker
  // instead of throwing mid-pipeline. Mirrors the categories coaching
  // run endpoint.
  const blocker = await checkCmaReadiness(siteId);
  if (blocker) {
    return NextResponse.json(
      { ok: false, error: "cma_required", code: blocker.code, message: blocker.message },
      { status: 412 },
    );
  }

  try {
    const plan = await runInfrastructurePipeline(siteId);
    const persisted = await persistDerivedServices(siteId, plan.derivedServices);
    const binding = await bindServicesToCategories({
      siteId,
      persistedServices: persisted,
      coachedCategories: plan.coachedCategories,
      clusters: plan.clusters,
    });

    // Invalidate any tenant route that renders services.
    try {
      const [siteRow] = await sql`
        SELECT blog_slug FROM businesses WHERE id = ${siteId} LIMIT 1
      `;
      const slug = siteRow?.blog_slug as string | undefined;
      if (slug) {
        revalidatePath(`/tenant/${slug}/work`);
        revalidatePath(`/tenant/${slug}`);
      }
    } catch (cacheErr) {
      console.warn("[site-services] revalidate failed:", cacheErr);
    }

    return NextResponse.json({
      ok: true,
      clustersCount: plan.clusters.length,
      servicesCreated: persisted.length,
      bound: binding.bound.length,
      unbound: binding.unbound.length,
      details: {
        clusters: plan.clusters.map((c) => ({
          cluster_id: c.cluster_id,
          intent_label: c.intent_label,
          memberQueryCount: c.member_queries.length,
        })),
        services: persisted.map((s) => ({
          id: s.id,
          name: s.name,
          slug: s.slug,
          description: s.description,
          cluster_id: s.cluster_id,
          cluster_intent_label: s.cluster_intent_label,
        })),
        binding,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[site-services] regenerate failed:", msg);
    return NextResponse.json(
      { ok: false, error: "regenerate_failed", message: msg },
      { status: 500 },
    );
  }
}
