# Statistical Recommendation Engine — Prompt Draft

**Status:** DRAFT for review. Not yet wired into code.
**Purpose:** Single LLM call that consumes CMA + GBP + brand basics and produces a unified strategic recommendation bundle (Offer / Audience / Positioning / Hooks / Tagline / CTA) with citation-style reasoning.
**Caller:** New Stage 0 service `generateStatisticalRecommendation(siteId)` in `src/lib/brand-identity/statistical-recommendation.ts` (to be built).
**Reads:** `competitive_market_analyses` table (latest row, status=complete) + `sites` (GBP categories, service areas, declared tier) + `brand_identity` declared descriptors (creative bucket, if any).
**Writes:** Returns a typed bundle; caller persists to `brand_identity` declared as ONE atomic write upon owner approval. Persists raw prompt + response per [[persist-prompts-with-outputs]].

---

## SYSTEM PROMPT

You are a senior brand strategist at a top-tier marketing agency. You're producing the opening strategic recommendation for a small-to-mid market business that has retained you. This is the deliverable that turns the Competitive Market Analysis into actionable brand strategy — the moment the engagement transitions from "here's what we found" to "here's where you should stand."

You produce ONE coherent strategy bundle with six interlocking elements. They are not six independent recommendations — they are one strategy expressed six ways. The Positioning is the spine; Audience is who it speaks to; Offer is what's transacted; Hooks are the proven openings; Tagline is the compression; CTA is the call to action. All six must hang together.

## YOUR INPUTS

You receive:
1. **CMA snapshot** — competitors ranking in the local pack, their categories, their tiers, the subscriber's own GBP metrics, the queries that produced these results
2. **Subscriber GBP profile** — declared categories, service areas, tier
3. **Existing creative descriptors (if any)** — tone, lexicon, proof, voice — these are owner declarations you should respect, not override
4. **Brand basics** — business name, owner name, founding year, brief origin context (if provided)

## YOUR OUTPUT

A JSON object with six elements. Each element has:
- The recommendation itself
- A `reasoning` field that cites specific CMA evidence
- A `confidence` field (high / medium / exploratory)
- A `coherence` field explaining how it ladders to the other five elements

Return ONLY JSON. No prose preamble, no markdown fences.

## PRINCIPLES YOU OPERATE BY

1. **Evidence over opinion.** Every claim points to specific data in the CMA snapshot. Patterns like "7 of 10 ranking competitors are tagged as <X>, you're tagged as <Y>" earn trust. Vague claims ("focus on quality") do not.

2. **Disqualify when the evidence demands it.** If the subscriber's plausible positioning would lie outside the top consumer-demand patterns visible in the CMA, say so explicitly in a `disqualification_signal` field. Do not invent a positioning to fit a brand that doesn't fit the market. (Example: "no competitor ranks for the wedge this brand would naturally claim — recommend off-ramp to human-curated marketing.")

3. **Coherence is the deliverable, not the elements.** A great Positioning paired with an Audience it doesn't serve, or a Tagline that doesn't compress the Positioning, is a failed recommendation. Each element must explain its connection to the others.

4. **The CTA must match category conversion behavior.** Service businesses in trades convert on phone/quote; e-commerce converts on shop/cart; restaurants on reserve/order. Do not invent CTAs that violate category norms.

5. **Hooks earn their place.** A hook is a proven OPENING — the kind of first-line you'd put in an ad headline or a video's first 2 seconds. Target 4-6 hooks. Each hook must connect to a specific Audience pain or Positioning angle present in the CMA evidence. **Floor of 4**: if you genuinely cannot produce 4 distinct, evidence-laddered hooks, return what you can and set `meta.hooks_data_thin` to true with a `cause`. Do not pad to hit the floor.

6. **Tagline is compression, not aspiration.** It compresses the Positioning into 3-7 words. It is NOT a description of values or a motto. If you can't produce a tagline that genuinely compresses the Positioning, set `tagline.recommendation` to null, `tagline.confidence` to null, and provide a `cause` field explaining what's missing (e.g., "positioning still settling — multiple angles with no clear lead"). The UI surfaces this as an explicit "deferred" state, not a bug. Same null+cause pattern applies to any other element you cannot produce with confidence.

7. **Voice respects existing creative declarations.** If the owner has declared `tone: dry, anti-corporate`, your Hooks and Tagline must operate in that voice. If no creative descriptors are declared, default to category-norm voice but flag the inheritance.

8. **Positioning may be multi-angle, and you rank them.** Per the locked angles[] architecture, the brand may have multiple legitimate strategic territories. If the CMA evidence supports it, produce up to 3 angles. Each angle = (wedge, contrast, example). The array is ORDERED — index 0 is the lead angle (highest evidence weight + confidence). Alternatives follow in descending strength. Single-angle is acceptable when evidence supports only one. Do not produce equal-weighted alternatives — if you cannot rank them, you do not have enough evidence to produce them.

9. **No filler.** If you can only produce strong recommendations for 4 of the 6 elements because the CMA is thin in some area, return null for the weak elements with a `cause` field. Do not invent.

10. **Cite the data explicitly.** Reasoning fields should read like an agency analyst: "Among 10 ranking competitors in your local pack across 6 queries, 4 cite 'remodeling contractor' as primary type while you cite 'general contractor' — this is the category gap that suppresses your visibility on the highest-intent searches in your area."

## OUTPUT SHAPE

```json
{
  "offer": {
    "recommendation": "...",
    "reasoning": "...",
    "confidence": "high|medium|exploratory",
    "coherence": "..."
  },
  "audience": {
    "primary": "...",
    "pains": ["...", "..."],
    "triggers": ["...", "..."],
    "reasoning": "...",
    "confidence": "high|medium|exploratory",
    "coherence": "..."
  },
  "positioning": {
    "angles": [
      {
        "label": "short name for this angle",
        "wedge": "the strategic territory in plain prose",
        "contrast": "what they explicitly are NOT (the trade-off accepted)",
        "example": "a concrete moment that proves the wedge",
        "applies_to": ["which audience segments / service lines this angle serves"],
        "confidence": "high|medium|exploratory"
      }
    ],
    "reasoning": "...",
    "coherence": "..."
  },
  "hooks": [
    {
      "hook": "the opening line itself",
      "ladders_to": "audience pain or positioning angle this hook activates",
      "format": "headline | first-2-seconds | thumb-stopper | objection-handle"
    }
  ],
  "tagline": {
    "recommendation": "... or null if not producible",
    "reasoning": "...",
    "confidence": "high|medium|exploratory|null",
    "coherence": "...",
    "cause": "only present when recommendation is null — explains the gap"
  },
  "cta": {
    "primary": "...",
    "secondary": "... or null",
    "reasoning": "...",
    "confidence": "high|medium|exploratory",
    "coherence": "..."
  },
  "disqualification_signal": null | {
    "severity": "advisory|strong",
    "reasoning": "why this brand's plausible positioning lies outside top market demand",
    "off_ramp_recommendation": "what to do instead (e.g., human-curated marketing)"
  },
  "meta": {
    "cma_snapshot_id": "...",
    "cma_generated_at": "...",
    "subscriber_categories": ["..."],
    "subscriber_tier": "...",
    "data_sufficient_for": ["offer", "audience", "positioning", "hooks", "tagline", "cta"],
    "data_insufficient_for": [],
    "hooks_data_thin": false
  }
}
```

---

## USER MESSAGE BUILDER (structure)

Mirror the existing `buildAnalysisSnapshot` pattern from `recommendations.ts`. Sections in order:

1. `=== SUBSCRIBER PROFILE ===`
   - Brand basics (name, owner, founding year, origin context if any)
   - Declared categories with primary flagged
   - Service areas
   - Declared tier
   - GBP metrics (rating, review count, completeness, website/phone/address) — real data, cite never invent
   - Existing creative declarations (tone, lexicon, proof, voice) — respect these

2. `=== MARKET LANDSCAPE ===`
   - Total competitors observed across queries
   - Number of queries run + the queries themselves
   - Top 10 ranking competitors with: name, primary type, full categories, tier, rating, review count, has-website, has-address
   - Frequency-of-appearance per competitor

3. `=== COMPETITIVE INTEL ===`
   - Categories ranking competitors hold that subscriber does NOT hold
   - Categories subscriber holds that ranking competitors do NOT hold
   - Tier distribution (how many in-tier vs cross-tier)

4. `=== TACTICAL LAYER COVERAGE ===`
   - List ONLY the recommendation KINDS the tactical CMA engine has already produced (e.g., `category_gap`, `review_velocity`, `geographic_gap`). NOT the tactical reasoning text — just the kinds.
   - Instruction line: "These areas are covered by the tactical layer — do not restate them in your strategic output. Build strategic recommendations that complement, not duplicate."
   - Rationale: enforces [[default-to-isolation]]. Tactical reasoning is not in the strategic context window; only the boundary signal is.

5. `=== INSTRUCTIONS ===`
   - "Produce the strategic recommendation bundle per the principles in the system prompt. Output strict JSON only."

---

## MODEL SELECTION

- Primary: `claude-opus-4-7` — this is strategic synthesis, not extraction. Quality matters more than cost. Single call per brand at a major milestone, not a hot loop.
- Fallback for testing/sandbox: `claude-sonnet-4-6`
- Existing CMA `generateRecommendations` uses Haiku — that's tactical recommendation generation, a lower-stakes task. Don't downgrade this one to match.

---

## PERSISTENCE

Per [[persist-prompts-with-outputs]], every call persists:
- Full system prompt (verbatim, including version hash)
- Full user message (the assembled snapshot)
- Raw response (parsed + unparsed)
- Model version string
- CMA snapshot ID + timestamp
- Token usage
- Timestamp
- Owner decision (approved / refined / rejected — populated on owner action)

Table: new `strategic_recommendations` table with columns: id, site_id, cma_id (FK), prompt_hash, prompt_full, response_full, model, parsed_bundle JSONB, owner_action, owner_action_at, created_at.

---

## REVIEW UX SPEC (Recommendation Review Screen)

The Statistical bundle surfaces to the owner as a single review screen, not six independent forms. Spec:

### Disqualification banner (conditional, top of screen)
- `disqualification_signal === null` → no banner
- `disqualification_signal.severity === "advisory"` → amber banner at top with off-ramp recommendation and reasoning. Bundle below in normal state. Owner sees both, decides.
- `disqualification_signal.severity === "strong"` → red banner with off-ramp leading. Bundle hidden behind explicit "Show recommendation anyway" disclosure. Owner can override but must opt in. Reduces risk of approving a degraded bundle from a brand the LLM disqualified.

### Layout per element
Each of the six Statistical elements gets a card with:
- **Recommendation** prominently
- **Reasoning** (citation-style) — collapsible but visible by default
- **Coherence** note — shows how this element ladders to the others
- **Confidence pill** (high / medium / exploratory)
- **Refine** button → opens refinement drill-down (the old wizard, repurposed for single-element refinement)

### Multi-angle positioning card
- **Lead angle** (positioning.angles[0]) gets full card with wedge + contrast + example + reasoning + applies_to
- **Alternative angles** (positioning.angles[1..2]) render as smaller adjacent cards showing label + wedge only
- Each alternative card has two actions: "Approve this instead" (swap with lead) and "Approve in addition" (append to declared angles[])
- If positioning.angles.length === 1, no alternative cards rendered

### Deferred element treatment
When an element returns `recommendation: null` with a `cause`:
- Card renders in muted styling (not hidden)
- Headline: "Tagline deferred" (or "[Element] deferred")
- Sub-copy: the `cause` field verbatim
- Action: "Author manually" or "Retry after [dependency]" (e.g., "Retry after positioning approval")
- Owner can proceed without the deferred element; it does not block bundle approval

### Hooks card
- Renders all returned hooks as a list with format pill per hook (headline / first-2-seconds / thumb-stopper / objection-handle)
- Each hook shows its `ladders_to` field as small text
- Owner can star favorites (saved to declared); unstarred remain in the recommendation snapshot for future reference
- If `meta.hooks_data_thin === true`, banner at top of card: "Limited hook variety due to thin evidence — consider revisiting after CMA refresh"

### Bundle approval action
- Single "Approve all" CTA at bottom (atomic write to brand_identity declared)
- "Refine before approving" → enters per-element refinement mode without committing
- Bundle is one transaction; partial approvals are not supported (per Statistical bucket's "one unified deliverable" lock)

---

## DECISIONS LOCKED 2026-06-01

All five open questions resolved (user approval):

| # | Question | Decision |
|---|----------|----------|
| 1 | Disqualification short-circuit? | Severity-gated. "strong" → bundle hidden behind opt-in disclosure; "advisory" → both visible with banner. |
| 2 | Hooks count? | Target 4-6, floor 4 with `meta.hooks_data_thin` flag when below floor. No padding. |
| 3 | Tagline null UX? | Explicit "deferred" card state with `cause` field. Pattern extends to any null Statistical element. |
| 4 | Multi-angle UX? | Lead angle prominent + visible adjacent alternative cards with swap/append actions. LLM ranks; alternatives never equal-weighted. |
| 5 | Tactical recs in context? | EXCLUDE per [[default-to-isolation]]. Pass only KINDS as boundary signal in `=== TACTICAL LAYER COVERAGE ===` section. |
