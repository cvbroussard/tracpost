import type { ChapterStrategy, ChapterStrategyKind } from "../types";
import { nextReadyChapterStrategy } from "./next-ready";

export const CHAPTER_STRATEGIES: Record<ChapterStrategyKind, ChapterStrategy> = {
  next_ready_chapter: nextReadyChapterStrategy,
  // milestone_triggered + asset_threshold strategies land later when
  // chapter triggers are wired (operator UI for marking chapters ready).
  milestone_triggered: nextReadyChapterStrategy,
  asset_threshold: nextReadyChapterStrategy,
};

export const CHAPTER_STRATEGY_LIST: ChapterStrategy[] = [nextReadyChapterStrategy];
