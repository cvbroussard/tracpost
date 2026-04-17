export type {
  PlatformKey,
  AspectRatio,
  GradePreset,
  RenderPlan,
  VariantRecord,
  VariantsMap,
  RenderConfig,
  BrandAssets,
  TextOverlay,
  OverlayPosition,
} from "./types";

export { PLATFORM_ASPECTS, ASPECT_DIMENSIONS } from "./types";
export { renderAsset } from "./engine";
export { generateRenderPlans, loadTenantSignals, loadContentSignals } from "./playbook";
export { cropForPlatform } from "./crops";
export { applyGrade } from "./grade";
export { applyTextOverlays, applyWatermark } from "./overlay";
export { createBeforeAfterComposite, detectBeforeAfterPair } from "./composite";
export { composeCarousel, shouldComposeCarousel } from "./carousel";
export {
  applyStatOverlay,
  resolveLocationTag,
  renderPinterestPin,
  formatGbpPost,
  inferGbpPostType,
  type LocationTag,
  type GbpPostType,
  type GbpPostPayload,
} from "./platform-specific";
export {
  createKenBurnsVideo,
  createTimelapse,
  reformatVideo,
  addVideoTextOverlay,
  burnSubtitles,
  generateThumbnail,
} from "./video";
export {
  syncEngagement,
  aggregatePerformance,
  recommendConfig,
  recommendAllConfigs,
  getPerformanceSummary,
} from "./learning";
