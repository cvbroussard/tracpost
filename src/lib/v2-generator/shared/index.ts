/**
 * Shared utilities consumed by all three v2 generators (blog/project/service).
 *
 * Each module is small, focused, and pool-agnostic. Generators import
 * what they need.
 */

export { MODEL_CONFIG, FALLBACK_MODEL, FALLBACK_MAX_TOKENS, getModelConfig } from "./model-config";
export type { ContentTypeKey, ModelConfig } from "./model-config";

export { pullHook } from "./hook-bank";

export { getExistingTitles } from "./existing-titles";
export type { Pool } from "./existing-titles";

export { getVendorLinks } from "./vendor-enrichment";
export type { VendorRef } from "./vendor-enrichment";

export { buildAssetContexts, formatAssetBlock } from "./asset-context-builder";
export type { AssetContext } from "./asset-context-builder";

export { researchAssetContext } from "./wikipedia-research";

export {
  repairCorruptedTracpostUrls,
  fixMalformedMarkdown,
  validateImageUrls,
  applyAllRepairs,
} from "./url-repair";

export { scanContent } from "./content-guard";
export type { ContentGuardResult } from "./content-guard";

export { buildArticleSchema } from "./schema-jsonld";
export type { ArticleSchemaInput } from "./schema-jsonld";

export { generateContentKit } from "./content-kit-generator";
export type { KitGenerateInput } from "./content-kit-generator";

export { getProjectLinks } from "./project-links";
