import { orchestrateBlog } from "./blog";
import { orchestrateProjectChapter, assessChapters } from "./project-chapter";
import { orchestrateService, previewServiceCandidates } from "./service";

/**
 * Autopilot dispatcher — top-level pool selector.
 *
 * On each tick the autopilot picks WHICH pool to generate this cycle
 * (blog vs project chapter vs service), then hands off to the
 * appropriate pool-specific orchestrator.
 *
 * Pool weights drive a weighted-random selection. The weights can be
 * tuned per site (eventually a sites.autopilot_pool_weights field) or
 * shifted dynamically based on site state. Defaults below favor blog
 * (the highest-cadence pool), with chapter + service as occasional
 * variety.
 *
 * If the picked pool can't produce content right now (e.g., no chapters
 * are 'ready'), the autopilot re-rolls without that pool until one
 * succeeds or all pools exhausted.
 */

export type Pool = "blog" | "project_chapter" | "service";

export interface AutopilotResult {
  pool: Pool;
  reason: string;
  generation: unknown;
}

const DEFAULT_WEIGHTS: Record<Pool, number> = {
  blog: 0.7,
  project_chapter: 0.2,
  service: 0.1,
};

export async function runAutopilot(
  siteId: string,
  opts?: {
    /** Force a specific pool (skip weighted selection). */
    forcePool?: Pool;
    /** Override the default pool weights. */
    weights?: Partial<Record<Pool, number>>;
  },
): Promise<AutopilotResult> {
  const weights = { ...DEFAULT_WEIGHTS, ...(opts?.weights || {}) };

  // Pre-flight gating: pools with no inputs available shouldn't be
  // candidates this tick.
  const eligible = await getEligiblePools(siteId, opts?.forcePool);
  if (eligible.length === 0) {
    throw new Error(`Autopilot has no eligible pools for site ${siteId}`);
  }

  // Force-pool bypass
  if (opts?.forcePool) {
    if (!eligible.includes(opts.forcePool)) {
      throw new Error(`Pool ${opts.forcePool} not eligible right now (no inputs)`);
    }
    return runPool(siteId, opts.forcePool, "forced");
  }

  // Weighted random across eligible pools
  const candidates = eligible.map((p) => ({ pool: p, weight: weights[p] || 0 })).filter((c) => c.weight > 0);
  const remaining = [...candidates];
  while (remaining.length > 0) {
    const total = remaining.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    let pickedIdx = 0;
    for (let i = 0; i < remaining.length; i++) {
      r -= remaining[i].weight;
      if (r <= 0) { pickedIdx = i; break; }
    }
    const picked = remaining[pickedIdx];
    try {
      return await runPool(siteId, picked.pool, `weighted-random (weight ${picked.weight.toFixed(2)})`);
    } catch (err) {
      // Pool failed (e.g. its only strategy couldn't build a spec). Re-roll without it.
      console.warn(`Autopilot pool ${picked.pool} failed:`, err instanceof Error ? err.message : err);
      remaining.splice(pickedIdx, 1);
    }
  }

  throw new Error(`Autopilot exhausted all eligible pools for site ${siteId}`);
}

async function runPool(siteId: string, pool: Pool, reasonSuffix: string): Promise<AutopilotResult> {
  if (pool === "blog") {
    const r = await orchestrateBlog(siteId);
    return { pool: "blog", reason: `Blog → ${r.reason} [${reasonSuffix}]`, generation: r.generation };
  }
  if (pool === "project_chapter") {
    const r = await orchestrateProjectChapter(siteId);
    return { pool: "project_chapter", reason: `Project chapter → ${r.reason} [${reasonSuffix}]`, generation: r.generation };
  }
  if (pool === "service") {
    const r = await orchestrateService(siteId);
    return { pool: "service", reason: `Service → ${r.reason} [${reasonSuffix}]`, generation: r.generation };
  }
  throw new Error(`Unknown pool: ${pool}`);
}

/** Determine which pools have inputs available right now. */
async function getEligiblePools(siteId: string, forcePool?: Pool): Promise<Pool[]> {
  if (forcePool) return [forcePool];

  const eligible: Pool[] = [];
  // Blog is always eligible — strategies decide whether they have inputs.
  eligible.push("blog");

  // Project-chapter eligible only when at least one chapter is 'ready'.
  const chap = await assessChapters(siteId);
  if (chap.readyChapters.length > 0) eligible.push("project_chapter");

  // Service eligible only when at least one service has stale content.
  const svcs = await previewServiceCandidates(siteId);
  const stale = svcs.filter((s) => s.staleDays > 90 || s.bodyLength < 200);
  if (stale.length > 0) eligible.push("service");

  return eligible;
}

/** Diagnostic — what the autopilot would do right now without generating. */
export async function previewAutopilot(siteId: string, weights?: Partial<Record<Pool, number>>): Promise<{
  eligiblePools: Pool[];
  weights: Record<Pool, number>;
}> {
  const w = { ...DEFAULT_WEIGHTS, ...(weights || {}) };
  const eligiblePools = await getEligiblePools(siteId);
  return { eligiblePools, weights: w };
}
