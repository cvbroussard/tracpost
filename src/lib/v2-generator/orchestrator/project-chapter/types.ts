import type { GenerateChapterResult } from "../../project";

/**
 * Project-chapter orchestrator — types.
 *
 * Scoped to PROJECT CHAPTER generation. Consumes ready chapters from
 * the project_chapters table. Each strategy decides which chapter to
 * pick this tick (next-in-sequence, milestone-driven, asset-threshold).
 */

export type ChapterStrategyKind =
  | "next_ready_chapter"
  | "milestone_triggered"
  | "asset_threshold";

export interface ChapterReadiness {
  chapterId: string;
  projectId: string;
  projectName: string;
  chapterSlug: string;
  chapterTitle: string;
  sequenceIndex: number;
  triggerKind: "milestone_date" | "manual" | "asset_threshold";
  status: "pending" | "ready" | "generated" | "skipped";
}

export interface ChapterSiteAssessment {
  siteId: string;
  /** Chapters in 'ready' status, ordered by project + sequence. */
  readyChapters: ChapterReadiness[];
  /** Total v2 projects on the site. */
  projectCount: number;
}

export interface ChapterOrchestrateResult {
  strategy: ChapterStrategyKind;
  reason: string;
  generation: GenerateChapterResult;
}

export interface ChapterStrategy {
  kind: ChapterStrategyKind;
  label: string;
  score(assessment: ChapterSiteAssessment): number;
  /** Returns the chapterId to generate, or null if not viable. */
  pick(assessment: ChapterSiteAssessment): Promise<string | null>;
}
