/**
 * Intent clustering — the shared upstream step that feeds both the
 * category coaching and services derivation pipelines.
 *
 * Per [[services-pipeline-doctrine]] (second-pass refinement 2026-06-16):
 * queries are the parent of both services and categories. Neither
 * generator should depend on the other's output; both consume the same
 * upstream clusters and tag their outputs with the source cluster_id.
 * The M:N service↔category junction is then a deterministic cluster_id
 * intersection — no LLM round-trip.
 *
 * Input:  AnalysisPayload from CMA (target queries + ranking competitors
 *         per query + competitor categories).
 * Output: IntentCluster[] — typically 5-8 clusters, each grouping queries
 *         that share semantic intent and/or ranking-competitor overlap.
 *
 * The clustering call uses Haiku for cost — the task is structural
 * (grouping similar queries), not creative. Diminishing-returns curve
 * caps the target cluster count at the doctrine's 5-8 sweet spot.
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { AnalysisPayload, EnrichedCompetitor } from "./analysis-assembly";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODEL = "claude-haiku-4-5-20251001";
const PROMPT_VERSION = "intent_clustering_v1";

/**
 * A query-intent cluster. cluster_id is a runtime-only handle — the
 * downstream M:N binder uses it to join services to categories. Both
 * generators (services + categories) tag their outputs with the
 * cluster_id they were derived from.
 */
export interface IntentCluster {
  /** Runtime-stable identifier — used as M:N join key. */
  cluster_id: string;
  /** Human-readable intent label (e.g. "kitchen renovation"). */
  intent_label: string;
  /** Queries from the CMA that belong to this cluster. */
  member_queries: string[];
  /**
   * Competitor place_ids observed ranking for any member query.
   * Ordered by appearance count desc — most frequent rankers first.
   */
  observed_competitor_place_ids: string[];
  /**
   * GBP category gcids observed across member queries' ranking
   * competitors, with frequency counts. Used by the category
   * coaching pipeline to pick the right gcids to claim for this
   * cluster. Used by the services pipeline as evidence of what
   * customers searching this intent are finding.
   */
  observed_category_frequencies: Array<{
    gcid: string;
    name: string;
    /** How many competitors in this cluster have this category. */
    count: number;
  }>;
}

export interface ClusteringResult {
  clusters: IntentCluster[];
  generated_at: string;
  model: string;
  prompt_version: string;
}

/**
 * LLM clustering call. Sends queries + per-query competitor info,
 * receives cluster assignments. The LLM returns intent_label +
 * member_query strings; this module deterministically attaches
 * observed_competitor_place_ids and observed_category_frequencies
 * by post-processing the AnalysisPayload.
 */
interface LlmClusterAssignment {
  intent_label: string;
  member_queries: string[];
}

const SYSTEM_PROMPT = `You are clustering SERP queries by customer search intent for a local business's competitive analysis.

Each query represents what customers actually type into Google when looking for the kind of service this business provides. Your job: group queries that target the same underlying intent.

CRITERIA for clustering:
1. SEMANTIC intent — "kitchen remodel Pittsburgh" and "kitchen renovation Pittsburgh" target the same intent (kitchen remodeling); "deck builder Pittsburgh" targets a different intent.
2. COMPETITOR OVERLAP — queries where the same competitors keep ranking are likely the same intent, even if the wording differs slightly.
3. CATEGORY OVERLAP — queries where ranking competitors share dominant GBP categories likely share intent.

TARGET 5-8 CLUSTERS total. This matches the diminishing-returns curve for visitor attention on a services strip:
- Fewer than 5 clusters likely under-groups (collapses distinct intents).
- More than 8 likely over-groups (splits the same intent into near-duplicates).

NAMING:
- intent_label should be SHORT and CUSTOMER-FACING — what a customer would call the activity (e.g. "kitchen renovation", "home addition", "historic home restoration"). NOT Google taxonomy labels ("Kitchen remodeler"). NOT operator jargon ("residential GC services").
- 2-5 words. Lowercase or sentence-case. No trailing punctuation.

CONSTRAINTS:
- Every input query must appear in exactly ONE cluster (no duplicates, no orphans).
- Cluster member_queries must use the EXACT input query strings (do not paraphrase or merge).
- If a query is genuinely ambiguous, place it with its strongest competitor-overlap neighbor.

OUTPUT a JSON array only. No prose, no markdown fences.

Schema:
[
  {
    "intent_label": "kitchen renovation",
    "member_queries": ["kitchen remodel Pittsburgh", "kitchen renovation Pittsburgh"]
  },
  ...
]`;

function buildUserMessage(payload: AnalysisPayload): string {
  const queryToCompetitors = new Map<string, EnrichedCompetitor[]>();
  for (const comp of payload.topCompetitors) {
    for (const appearance of comp.appearedInQueries) {
      const list = queryToCompetitors.get(appearance.query) ?? [];
      list.push(comp);
      queryToCompetitors.set(appearance.query, list);
    }
  }

  const competitorCategoriesByCid = new Map(
    payload.competitorCategories.map((cc) => [cc.cid, cc]),
  );

  const lines: string[] = [
    "QUERIES TO CLUSTER (with ranking-competitor context):",
    "",
  ];

  for (const q of payload.targetQueries) {
    const ranks = queryToCompetitors.get(q.query) ?? [];
    const rankSummary = ranks
      .slice(0, 5)
      .map((r) => {
        const cats = competitorCategoriesByCid.get(r.placeId);
        const primaryCat = cats?.displayNames?.[0] ?? r.type ?? "(no category)";
        return `${r.title} [${primaryCat}]`;
      })
      .join(", ");
    lines.push(`- "${q.query}"`);
    if (rankSummary) {
      lines.push(`    ranking competitors: ${rankSummary}`);
    }
  }

  lines.push("");
  lines.push(
    `Cluster the ${payload.targetQueries.length} queries into 5-8 intent groups. Return JSON only.`,
  );

  return lines.join("\n");
}

/**
 * Run intent clustering against a completed CMA payload.
 * Returns the clusters along with metadata for provenance.
 */
export async function clusterIntents(
  payload: AnalysisPayload,
): Promise<ClusteringResult> {
  if (payload.targetQueries.length === 0) {
    return {
      clusters: [],
      generated_at: new Date().toISOString(),
      model: MODEL,
      prompt_version: PROMPT_VERSION,
    };
  }

  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserMessage(payload) }],
  });

  const text = res.content[0]?.type === "text" ? res.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error(
      `intent-clustering: model returned no JSON array (length=${text.length})`,
    );
  }

  let assignments: LlmClusterAssignment[];
  try {
    assignments = JSON.parse(match[0]) as LlmClusterAssignment[];
  } catch (parseErr) {
    const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
    throw new Error(`intent-clustering: JSON.parse failed — ${parseMsg}`);
  }

  if (!Array.isArray(assignments) || assignments.length === 0) {
    throw new Error("intent-clustering: model returned empty assignments");
  }

  // Deterministic post-processing: for each cluster, attach the
  // observed competitors + category frequencies by walking the
  // payload's per-query competitor data. The LLM only decides
  // grouping + labeling; structural data is derived from the CMA
  // payload, not the model's text.
  const clusters: IntentCluster[] = assignments.map((a, i) =>
    enrichCluster(`cluster_${i + 1}`, a, payload),
  );

  return {
    clusters,
    generated_at: new Date().toISOString(),
    model: MODEL,
    prompt_version: PROMPT_VERSION,
  };
}

function enrichCluster(
  cluster_id: string,
  assignment: LlmClusterAssignment,
  payload: AnalysisPayload,
): IntentCluster {
  const memberQueriesSet = new Set(assignment.member_queries);

  // Collect competitors that ranked for any member query.
  const competitorAppearances = new Map<string, number>();
  for (const comp of payload.topCompetitors) {
    let count = 0;
    for (const appearance of comp.appearedInQueries) {
      if (memberQueriesSet.has(appearance.query)) count++;
    }
    if (count > 0) competitorAppearances.set(comp.placeId, count);
  }

  const observed_competitor_place_ids = [...competitorAppearances.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([cid]) => cid);

  // Walk competitor categories for each cluster member.
  // For each competitor in the cluster, count their declared gcids.
  const categoryCounts = new Map<string, { name: string; count: number }>();
  for (const cid of observed_competitor_place_ids) {
    const cats = payload.competitorCategories.find((c) => c.cid === cid);
    if (!cats) continue;
    for (let i = 0; i < cats.gcids.length; i++) {
      const gcid = cats.gcids[i];
      const name = cats.displayNames[i] ?? gcid;
      const existing = categoryCounts.get(gcid);
      if (existing) {
        existing.count++;
      } else {
        categoryCounts.set(gcid, { name, count: 1 });
      }
    }
  }

  const observed_category_frequencies = [...categoryCounts.entries()]
    .map(([gcid, { name, count }]) => ({ gcid, name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    cluster_id,
    intent_label: assignment.intent_label,
    member_queries: [...memberQueriesSet],
    observed_competitor_place_ids,
    observed_category_frequencies,
  };
}
