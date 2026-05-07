import { generateProjectChapter } from "../../project";
import { assessChapters } from "./assess";
import { CHAPTER_STRATEGY_LIST } from "./strategies";
import type { ChapterOrchestrateResult, ChapterStrategyKind } from "./types";

export type { ChapterOrchestrateResult, ChapterStrategyKind, ChapterSiteAssessment } from "./types";
export { assessChapters } from "./assess";
export { CHAPTER_STRATEGIES, CHAPTER_STRATEGY_LIST } from "./strategies";

/**
 * Run one PROJECT-CHAPTER orchestrator tick.
 *
 * SCOPE: project chapters only. Picks from project_chapters where
 * status='ready' and routes to generateProjectChapter.
 *
 * Throws if no chapter is ready — this is the caller's signal that
 * the autopilot should pick a different pool this tick.
 */
export async function orchestrateProjectChapter(
  siteId: string,
  opts?: { forceStrategy?: ChapterStrategyKind },
): Promise<ChapterOrchestrateResult> {
  const assessment = await assessChapters(siteId);

  const scored = CHAPTER_STRATEGY_LIST.map((s) => ({
    strategy: s,
    score: opts?.forceStrategy === s.kind ? 1 : s.score(assessment),
  }));

  // Try strategies in score order
  const eligible = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  for (const { strategy, score } of eligible) {
    const chapterId = await strategy.pick(assessment);
    if (!chapterId) continue;
    const generation = await generateProjectChapter({ chapterId, status: "draft" });
    return {
      strategy: strategy.kind,
      reason: `${strategy.label} (score ${score.toFixed(2)})`,
      generation,
    };
  }

  throw new Error(`No project chapter ready to generate for site ${siteId}`);
}

/** Diagnostic — what the orchestrator would do right now. */
export async function previewChapterStrategies(
  siteId: string,
): Promise<Array<{ kind: ChapterStrategyKind; label: string; score: number; readyCount: number }>> {
  const assessment = await assessChapters(siteId);
  return CHAPTER_STRATEGY_LIST
    .map((s) => ({
      kind: s.kind,
      label: s.label,
      score: s.score(assessment),
      readyCount: assessment.readyChapters.length,
    }))
    .sort((a, b) => b.score - a.score);
}
