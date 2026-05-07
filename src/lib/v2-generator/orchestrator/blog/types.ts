import type { BlogGenerateSpec, BlogGenerateResult } from "../../blog";

/**
 * Blog orchestrator — types.
 *
 * Scoped to BLOG article generation only. No cross-pool strategies.
 * Each strategy scores against a blog-specific site assessment and
 * builds a BlogGenerateSpec; the orchestrator routes it to
 * generateBlogArticle.
 */

export type BlogStrategyKind =
  | "asset_driven"
  | "reward_prompt"
  | "pillar_fill"
  | "synthesis";

export interface BlogSiteAssessment {
  siteId: string;

  /** Pillar coverage map: pillar → v2 blog article count. */
  pillarCoverage: Record<string, number>;

  /** Pillars of the most recent N v2 blog articles. */
  recentArticlePillars: string[];

  /** Total v2 blog articles. */
  publishedCount: number;

  /** High-quality unused-as-seed asset ids (top 50). */
  freshAssetIds: string[];

  /** Reward prompts from sites.brand_dna.signals.reward_prompts. */
  rewardSignals: {
    prompts: Array<{
      id: string;
      label: string;
      goal: string;
      intent: string;
      framingAngle: string;
      assetBias?: "proof" | "process" | "people" | "before_after";
    }>;
    activeGoals: string[];
    seasonality: string | null;
  };
}

export interface BlogOrchestrateResult {
  strategy: BlogStrategyKind;
  reason: string;
  generation: BlogGenerateResult;
}

export interface BlogStrategy {
  kind: BlogStrategyKind;
  label: string;
  score(assessment: BlogSiteAssessment): number;
  /** Returns the BlogGenerateSpec to hand off to generateBlogArticle, or null if not viable. */
  build(assessment: BlogSiteAssessment): Promise<BlogGenerateSpec | null>;
}
