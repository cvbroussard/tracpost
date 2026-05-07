import type { BlogStrategy } from "../types";
import type { BlogGenerateSpec } from "../../../blog";

/**
 * Hybrid synthesis blog strategy.
 *
 * Adds an extra Haiku call to converge multiple signals (reward goals,
 * pillar imbalance, recent winners) into the optimal next article.
 *
 * STUB. Returns null and scores 0 until the synthesis LLM call is
 * implemented. Honest scoring — won't waste orchestrator picks.
 */
export const synthesisStrategy: BlogStrategy = {
  kind: "synthesis",
  label: "Hybrid synthesis (multi-signal)",

  score(_assessment) {
    return 0;
  },

  async build(_assessment): Promise<BlogGenerateSpec | null> {
    return null;
  },
};
