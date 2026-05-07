import type { ChapterStrategy } from "../types";

/**
 * Next-ready-chapter strategy.
 *
 * Picks the FIRST chapter in 'ready' status across all the site's
 * projects, ordered by (project_id, sequence_index). Simple and
 * predictable — chapters generated in lifecycle order.
 *
 * Other strategies (milestone-triggered, asset-threshold) can layer
 * different selection logic later.
 */
export const nextReadyChapterStrategy: ChapterStrategy = {
  kind: "next_ready_chapter",
  label: "Next ready chapter (sequence order)",

  score(assessment) {
    if (assessment.readyChapters.length === 0) return 0;
    return 0.8;
  },

  async pick(assessment) {
    if (assessment.readyChapters.length === 0) return null;
    return assessment.readyChapters[0].chapterId;
  },
};
