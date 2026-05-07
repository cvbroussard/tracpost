import type { BlogStrategy, BlogStrategyKind } from "../types";
import { assetDrivenStrategy } from "./asset-driven";
import { pillarFillStrategy } from "./pillar-fill";
import { rewardPromptStrategy } from "./reward-prompt";
import { synthesisStrategy } from "./synthesis";

export const BLOG_STRATEGIES: Record<BlogStrategyKind, BlogStrategy> = {
  asset_driven: assetDrivenStrategy,
  pillar_fill: pillarFillStrategy,
  reward_prompt: rewardPromptStrategy,
  synthesis: synthesisStrategy,
};

export const BLOG_STRATEGY_LIST: BlogStrategy[] = Object.values(BLOG_STRATEGIES);
