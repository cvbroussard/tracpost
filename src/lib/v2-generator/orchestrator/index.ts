/**
 * v2 orchestrator — public API.
 *
 * 2026-05-07 restructure: replaced single-orchestrator-with-cross-pool-strategies
 * with three pool-specific orchestrators + a top-level autopilot dispatcher.
 *
 *   ./blog/             — BlogOrchestrator + blog-only strategies
 *   ./project-chapter/  — ProjectChapterOrchestrator + chapter strategies
 *   ./service/          — ServiceOrchestrator
 *   ./autopilot.ts      — top-level pool dispatcher
 *
 * The fork between article TYPES happens in the autopilot dispatcher,
 * BEFORE any orchestrator runs. Each orchestrator is scoped to its
 * pool and never picks across pools.
 *
 * Each test script targets ONE orchestrator directly — clean isolation
 * for debugging or polish work scoped to a single article type.
 */

// Blog orchestrator — most polish work happens here
export {
  orchestrateBlog,
  orchestrateBlogBatch,
  previewBlogStrategies,
  assessBlogSite,
  BLOG_STRATEGIES,
  BLOG_STRATEGY_LIST,
} from "./blog";
export type {
  BlogStrategyKind,
  BlogSiteAssessment,
  BlogOrchestrateResult,
} from "./blog";

// Project chapter orchestrator
export {
  orchestrateProjectChapter,
  previewChapterStrategies,
  assessChapters,
  CHAPTER_STRATEGIES,
  CHAPTER_STRATEGY_LIST,
} from "./project-chapter";
export type {
  ChapterStrategyKind,
  ChapterSiteAssessment,
  ChapterOrchestrateResult,
} from "./project-chapter";

// Service orchestrator
export {
  orchestrateService,
  previewServiceCandidates,
} from "./service";
export type {
  ServiceStrategyKind,
  ServiceOrchestrateResult,
} from "./service";

// Autopilot — top-level dispatcher
export { runAutopilot, previewAutopilot } from "./autopilot";
export type { Pool, AutopilotResult } from "./autopilot";

// ── Backward compat aliases (legacy callers; do not use in new code) ──
// scripts/orchestrate-v2-batch.js calls these names. Aliased to the
// blog orchestrator so existing scripts keep working unchanged. New
// code should call orchestrateBlog / runAutopilot directly.

import { orchestrateBlog, orchestrateBlogBatch, previewBlogStrategies } from "./blog";
export const orchestrate = orchestrateBlog;
export const orchestrateBatch = orchestrateBlogBatch;
export const previewStrategies = previewBlogStrategies;
