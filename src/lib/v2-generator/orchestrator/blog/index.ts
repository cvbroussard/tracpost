import { generateBlogArticle } from "../../blog";
import { assessBlogSite } from "./assess";
import { BLOG_STRATEGY_LIST } from "./strategies";
import type {
  BlogStrategyKind,
  BlogSiteAssessment,
  BlogOrchestrateResult,
} from "./types";

export type { BlogStrategyKind, BlogSiteAssessment, BlogOrchestrateResult } from "./types";
export { assessBlogSite } from "./assess";
export { BLOG_STRATEGIES, BLOG_STRATEGY_LIST } from "./strategies";

/**
 * Run one BLOG orchestrator tick: assess → score blog strategies →
 * pick → build → generate. Returns the chosen strategy + the blog
 * generation result.
 *
 * SCOPE: blog articles only. Does not touch projects or services.
 * The autopilot dispatcher is the layer above that picks WHICH
 * orchestrator to run.
 */
export async function orchestrateBlog(
  siteId: string,
  opts?: {
    forceStrategy?: BlogStrategyKind;
    assessment?: BlogSiteAssessment;
  },
): Promise<BlogOrchestrateResult> {
  const assessment = opts?.assessment ?? await assessBlogSite(siteId);

  const scored = BLOG_STRATEGY_LIST.map((s) => ({
    strategy: s,
    score: opts?.forceStrategy === s.kind ? 1 : s.score(assessment),
  }));

  // Force-strategy bypass
  if (opts?.forceStrategy) {
    const forced = scored.find((s) => s.strategy.kind === opts.forceStrategy);
    if (!forced) throw new Error(`Forced blog strategy ${opts.forceStrategy} not registered`);
    const spec = await forced.strategy.build(assessment);
    if (!spec) throw new Error(`Forced blog strategy ${opts.forceStrategy} could not build a spec`);
    const generation = await generateBlogArticle(spec);
    return {
      strategy: forced.strategy.kind,
      reason: `${forced.strategy.label} (forced)`,
      generation,
    };
  }

  // Weighted-random across non-zero scoring strategies
  const eligible = scored.filter((s) => s.score > 0);
  while (eligible.length > 0) {
    const totalWeight = eligible.reduce((sum, s) => sum + s.score, 0);
    let r = Math.random() * totalWeight;
    let pickedIdx = 0;
    for (let i = 0; i < eligible.length; i++) {
      r -= eligible[i].score;
      if (r <= 0) {
        pickedIdx = i;
        break;
      }
    }
    const picked = eligible[pickedIdx];
    const spec = await picked.strategy.build(assessment);
    if (spec) {
      const generation = await generateBlogArticle(spec);
      return {
        strategy: picked.strategy.kind,
        reason: `${picked.strategy.label} (score ${picked.score.toFixed(2)}, weighted-random)`,
        generation,
      };
    }
    eligible.splice(pickedIdx, 1);
  }

  throw new Error(`No blog strategy could produce content for site ${siteId}`);
}

/**
 * Sequential batch — re-assesses after every article so coverage and
 * unused-asset shifts inform later picks.
 */
export async function orchestrateBlogBatch(
  siteId: string,
  count: number,
  onTick?: (i: number, result: BlogOrchestrateResult) => void,
): Promise<BlogOrchestrateResult[]> {
  const results: BlogOrchestrateResult[] = [];
  for (let i = 0; i < count; i++) {
    const result = await orchestrateBlog(siteId);
    results.push(result);
    if (onTick) onTick(i + 1, result);
  }
  return results;
}

/** Preview strategy scores without generating anything. */
export async function previewBlogStrategies(
  siteId: string,
): Promise<Array<{ kind: BlogStrategyKind; label: string; score: number }>> {
  const assessment = await assessBlogSite(siteId);
  return BLOG_STRATEGY_LIST
    .map((s) => ({ kind: s.kind, label: s.label, score: s.score(assessment) }))
    .sort((a, b) => b.score - a.score);
}
