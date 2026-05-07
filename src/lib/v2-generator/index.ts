/**
 * v2 content generator — public API.
 *
 * Per the 2026-05-07 redesign: three pool-specific generators
 * (blog / project / service) replace the legacy single-core generator.
 * The legacy `generateBlogPost`, `generateProjectPage`,
 * `generateServicePage` from ./adapters and `generateV2Content` from
 * ./core are retained for backward-compat with one-shot scripts that
 * still import them, but new code should use the per-pool exports.
 *
 * New (preferred):
 *   import { generateBlogArticle } from "@/lib/v2-generator";
 *   import { generateProjectChapter, seedChaptersForProject } from "@/lib/v2-generator";
 *   import { generateServicePage as generateServicePageV2 } from "@/lib/v2-generator/service";
 *
 * Slicing (unchanged):
 *   import { slice, sliceAll } from "@/lib/v2-generator";
 */

// New generators (per-pool, redesign 2026-05-07)
export { generateBlogArticle } from "./blog";
export type {
  BlogContentType,
  BlogGenerateSpec,
  BlogGenerateResult,
} from "./blog";
export {
  generateProjectChapter,
  seedChaptersForProject,
  markChapterReady,
  getProjectChapters,
} from "./project";
export type {
  ProjectChapter,
  ChapterTemplate,
  GenerateChapterSpec,
  GenerateChapterResult,
} from "./project";

// Legacy entrypoints (still consumed by some scripts; do not use in new code)
export { generateBlogPost, generateProjectPage, generateServicePage } from "./adapters";
export { generateV2Content } from "./core";
export { slice, sliceAll } from "./slicers";
// Per-pool orchestrators (preferred)
export {
  orchestrateBlog,
  orchestrateBlogBatch,
  previewBlogStrategies,
  assessBlogSite,
  orchestrateProjectChapter,
  previewChapterStrategies,
  assessChapters,
  orchestrateService,
  previewServiceCandidates,
  runAutopilot,
  previewAutopilot,
} from "./orchestrator";
export type {
  BlogStrategyKind,
  BlogSiteAssessment,
  BlogOrchestrateResult,
  ChapterStrategyKind,
  ChapterSiteAssessment,
  ChapterOrchestrateResult,
  ServiceStrategyKind,
  ServiceOrchestrateResult,
  Pool,
  AutopilotResult,
} from "./orchestrator";

// Legacy aliases (orchestrate → orchestrateBlog) — kept for scripts
export { orchestrate, orchestrateBatch, previewStrategies } from "./orchestrator";
export { generateRewardPrompts } from "./reward-prompts/generate";
export type { RewardPrompt } from "./reward-prompts/generate";
export {
  PLATFORM_REGISTRY,
  PLATFORM_FORMATS,
  getPlatformDef,
  findFormatKey,
} from "./platform-registry";
export type { PlatformFormat, PlatformDef, Slicer, SlicerContext } from "./platform-registry";
export type {
  ContentPool,
  ContentSpec,
  ContentKit,
  GeneratedBody,
  SlicedCaption,
  GenerateResult,
} from "./types";
