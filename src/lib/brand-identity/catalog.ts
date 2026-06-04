/**
 * Brand-identity descriptor CATALOG — the canonical baseline set of descriptors a
 * brand profile contains. It is the stable contract the production pipeline reads
 * (generation) and grades against (brand-fit). Seeds every new brand_identity;
 * brands may add free-form descriptors beyond it.
 *
 * Design (locked 2026-05-29): a brand identity is a SET OF DESCRIPTORS, each a unit
 * of { declared text + backing assets (→ their full media_assets enrichment graph:
 * recording → transcription → analysis → briefing) + extracted value + extraction
 * provenance/confidence }. Identity is PERSISTENT across all campaigns; a creative
 * brief is a per-campaign FROZEN resolution of it (`override ?? brand_default`).
 *
 * The same descriptor pulls double duty: generation reads `extracted`; grading
 * checks an output against the same `extracted` (the descriptors ARE the brand-fit
 * rubric — grades themselves live on the production layer, never here).
 */

export type BrandDomain = "verbal" | "strategic" | "visual" | "sonic";

export const BRAND_DOMAINS: readonly BrandDomain[] = [
  "verbal",
  "strategic",
  "visual",
  "sonic",
] as const;

/** The medium(s) a descriptor is expressed in. */
export type DescriptorMedium = "text" | "asset" | "extracted";

/**
 * Which side LEADS — drives the onboarding ask-vs-learn split:
 *  - "declared":  ask the owner/agency (a brand-wizard question)
 *  - "extracted": the system learns it from the accumulating substrate
 */
export type DescriptorLean = "declared" | "extracted";

/**
 * The brand-safety contract for the per-campaign brief layer:
 *  - "flexible":  a brief MAY override this for one campaign
 *  - "guardrail": absolute — a brief can NEVER override it
 */
export type DescriptorOverride = "flexible" | "guardrail";

/**
 * Sub-input type for decomposed text inputs (picker form #3). A descriptor with
 * `inputs[]` defined renders as a structured form (sub-fields per input) instead
 * of a single textarea. The owner's `declared` for such descriptors is a JSONB
 * object keyed by each input's `key`.
 *
 *  - "prose"             — multi-row textarea; declared holds a string
 *  - "list"              — N short slots; declared holds string[]
 *  - "slot_composition"  — N structured slots (text + picker), each holding 2-7
 *                          words. Declared holds an object keyed by slot.key.
 *                          The slots ARE the substrate — no Stage 1 extraction
 *                          needed. A composition LLM (Stage 0, deferred) reads
 *                          the slots + brand voice + GBP categories to produce
 *                          the rendered prose for downstream consumers.
 *  - "angle_collection"  — array of complete positioning angles. Each angle is
 *                          a triple of (wedge + contrast + example) plus
 *                          applies_to metadata. Brand may have 1-N angles; the
 *                          orchestrator at generation time selects which angle
 *                          fits the asset's context. Generalist SMBs have many
 *                          angles; specialty brands have one. Same data model.
 *                          Declared holds `{ angles: AngleData[] }`.
 */
export type InputType = "prose" | "list" | "slot_composition" | "angle_collection";

/**
 * Field within an angle section. Mirrors a single question in the owner's
 * 10-question-per-angle form.
 */
export interface AngleField {
  key: string;
  label: string;
  prompt: string;
  placeholder?: string;
  kind: "text" | "textarea" | "multi_picker" | "gbp_categories_picker";
  options?: string[];
  rows?: number;
  required?: boolean;
}

/**
 * Logical grouping of fields within an angle (e.g. wedge, contrast, example).
 * Used by the renderer to visually group related questions.
 */
export interface AngleSection {
  key: string;
  label: string;
  /** Optional sub-description shown under the section header. */
  description?: string;
  fields: AngleField[];
}

/**
 * Slot definition for `inputType: "slot_composition"`. Each slot is a small
 * focused input — text or picker — meant to be answerable in 2-7 words. The
 * collection of slots IS the canonical substrate; downstream composition
 * produces prose from these.
 */
export interface DescriptorSlot {
  /** Becomes the key in the declared sub-object. Stable; never rename. */
  key: string;
  label: string;
  prompt: string;
  /** Example value shown as placeholder. */
  placeholder?: string;
  /**
   *  - "text"   — free-text short input
   *  - "picker" — owner picks from `options[]` (analogue chips). Free-text
   *               fallback handled by appending the picked option to declared.
   */
  kind: "text" | "picker";
  /** When `kind: "picker"`, the picker options. */
  options?: string[];
  required?: boolean;
}

export interface DescriptorInput {
  /** Becomes the key in the declared JSONB object. Stable; never rename. */
  key: string;
  label: string;
  /** The actual question shown to the owner. */
  prompt: string;
  inputType: InputType;
  /** For `list` inputs — how many slots to render by default. */
  slotCount?: number;
  /** Significance-ranking qualifier (e.g. "main", "signature", "core", "defining"). */
  qualifier?: string;
  /** For `prose` inputs — textarea rows. */
  rows?: number;
  /** Drives the completion gate for this descriptor. */
  required?: boolean;
  /** For `slot_composition` inputs — the structured slot collection. */
  slots?: DescriptorSlot[];
  /**
   * For `angle_collection` inputs — the schema for each angle entry. The owner
   * fills the same form (sections × fields) for each angle they declare.
   */
  angleSchema?: AngleSection[];
  /** For `angle_collection` inputs — how many empty angle cards to render by default. */
  defaultAngleCount?: number;
}

/**
 * Validation phase — the development/onboarding order across descriptors.
 * Lower phases are dependency-free or canonical-anchored; higher phases
 * depend on earlier phases being completed. Crosses domain boundaries
 * because dependencies don't respect domain grouping (e.g. verbal.tone is
 * Phase 1 foundation but verbal.tagline is Phase 4 because tagline depends
 * on positioning landing first). See [[descriptor-design-protocol]] and
 * [[brand-identity-schema]] validation-DAG locks.
 *
 * Subject to change as the architecture matures; treat as the working
 * sequence, not the final lock.
 */
export type DescriptorPhase = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export const PHASE_LABELS: Record<DescriptorPhase, string> = {
  1: "Foundation",
  2: "Strategic Foundations",
  3: "Positioning",
  4: "Strategic Application",
  5: "Voice Details",
  6: "Visual Identity",
  7: "Sonic Identity",
};

export const PHASE_DESCRIPTIONS: Record<DescriptorPhase, string> = {
  1: "Foundational voice + guardrails. No upstream dependencies. Fill first.",
  2: "Who we serve + what we offer. Depends on Phase 1.",
  3: "Strategic differentiation (wedge / contrast / example). Depends on Phase 1, 2, and GBP categories.",
  4: "Tactical surfaces that consume positioning (proof, hooks, CTA, tagline).",
  5: "Supplemental voice details (lexicon, mechanical style).",
  6: "Visual brand band — aesthetic, environment, subjects, palette, logo.",
  7: "Sonic identity (voiceover, music, sfx, pronunciation).",
};

export interface DescriptorSpec {
  /** Stable key, unique within its domain. Full contract id = `${domain}.${key}`. */
  key: string;
  domain: BrandDomain;
  label: string;
  /** What it captures. */
  describes: string;
  media: DescriptorMedium[];
  lean: DescriptorLean;
  override: DescriptorOverride;
  /**
   * Validation/onboarding phase. Used by the ops UI to group descriptors by
   * development sequence rather than by domain. See `PHASE_LABELS`.
   */
  phase: DescriptorPhase;
  /**
   * Decomposed sub-inputs. When present, the descriptor card renders structured
   * fields instead of a single textarea, and `declared` is a JSONB object keyed
   * by each input's `key`. When absent, the descriptor uses a single textarea
   * and `declared` is a JSONB string.
   */
  inputs?: DescriptorInput[];
}

export const BRAND_DESCRIPTOR_CATALOG: readonly DescriptorSpec[] = [
  // ── Verbal — feeds hook/script, copy, VO script ──────────────────────────
  {
    key: "tone",
    domain: "verbal",
    label: "Tone",
    describes:
      "How the voice FEELS. Three layers: (1) emotional register (confident, warm, urgent, calm, dry); (2) attitude toward the reader (peer-to-peer vs authority-to-novice, generous vs guarded, formal vs intimate); (3) energy (high/punchy vs measured/restrained). Distinct from `lexicon` (which words you use) and `mechanical_style` (casing/emoji/rhythm) — tone is what makes a paragraph sound like YOUR brand vs anyone else's, even when the content is the same.",
    media: ["text", "extracted"],
    lean: "declared",
    override: "flexible",
    phase: 1,
  },
  {
    key: "lexicon",
    domain: "verbal",
    label: "Lexicon",
    describes: "Words and terms to USE — how the brand names things, its terms of art.",
    media: ["text", "extracted"],
    lean: "extracted",
    override: "flexible",
    phase: 5,
  },
  {
    key: "avoid",
    domain: "verbal",
    label: "Avoid",
    describes:
      "Words, phrases, and claims to NEVER use — a guardrail a brief can't override. Don't just list words; state the REASON or pattern (e.g. 'raises false expectations,' 'cheapens craft,' 'compliance-flagged'). The reason lets extraction generalize beyond the literal list. Common families: category cliches (HGTV/realtor language), hyperbolic claims (best/perfect/guaranteed), and industry-specific compliance terms.",
    media: ["text"],
    lean: "declared",
    override: "guardrail",
    phase: 1,
  },
  {
    key: "pov_persona",
    domain: "verbal",
    label: "Point of view",
    describes:
      "Two parts: (1) WHO speaks — a single individual (the owner), a collective team voice, or an anonymous brand voice; (2) the GRAMMATICAL PERSON used — 1st-singular ('I'), 1st-plural ('we'), or 3rd-person ('B Squared has…'). Worth calling out edge cases: VO scripts often need a single speaker even when the brand is collective, and 3rd-person reads more polished in formal contexts (proposals, case studies). State the default + any exceptions.",
    media: ["text"],
    lean: "declared",
    override: "flexible",
    phase: 1,
  },
  {
    key: "mechanical_style",
    domain: "verbal",
    label: "Mechanical style",
    describes: "Casing, emoji policy, hashtags, sign-offs, sentence-length pattern.",
    media: ["text", "extracted"],
    lean: "extracted",
    override: "flexible",
    phase: 5,
  },
  {
    key: "tagline",
    domain: "verbal",
    label: "Tagline",
    describes:
      "OPTIONAL. CREATIVE-OUTPUT descriptor: declared = THEMATIC DIRECTION + reference examples; extracted = the polished, sticky version that becomes the source of truth. Don't write a flat statement to avoid anchoring — that STRIPS signal. Instead: name the themes/imagery/virtues you'd want the tagline to carry, paste past attempts as REFERENCE (not prescriptions — say 'don't reuse these phrasings'), and add a length constraint. Strong taglines: SHORT (3-7 words), STICKY (verb with weight, rhythm, inversion, unusual word). Distinct from positioning — positioning EXPLAINS the wedge; tagline COMPRESSES it. Leave empty if you have no thematic direction at all.",
    media: ["text"],
    lean: "declared",
    override: "flexible",
    phase: 4,
  },

  // ── Strategic — feeds angle selection, what-to-say ───────────────────────
  {
    key: "offer",
    domain: "strategic",
    label: "Offer",
    describes:
      "Two parts: (1) the services or products you provide — these come from the canonical GBP categories established by competitive market analysis + categories coaching, shown read-only — AND (2) the benefit your clients get from choosing you (owner-declared below). Don't fold the benefit into the service list — state it separately.",
    media: ["text"],
    lean: "declared",
    override: "flexible",
    phase: 2,
    inputs: [
      {
        key: "benefits",
        label: "Benefits clients get from choosing you",
        prompt: "List 5 of the benefits your clients get from choosing you",
        inputType: "list",
        slotCount: 5,
        qualifier: "main",
        required: true,
      },
      {
        key: "example",
        label: "A specific example",
        prompt: "Tell us about a recent client or project that exemplifies what you offer — in your own voice.",
        inputType: "prose",
        rows: 4,
        required: true,
      },
    ],
  },
  {
    key: "positioning",
    domain: "strategic",
    label: "Positioning",
    describes:
      "Positioning isn't ONE wedge for most businesses — it's the inventory of angles you can credibly stand behind. Each angle = a stance (wedge) + the alternatives you're NOT (contrast) + a real example showing the angle in action. Generalists have multiple angles; specialty brands have one. Default: 3 angle slots. Orchestrator picks the right angle per asset at generation time.",
    media: ["text"],
    lean: "declared",
    override: "flexible",
    phase: 3,
    inputs: [
      {
        key: "angles",
        label: "Positioning angles",
        prompt:
          "Each angle is a complete stance. Fill as many as your brand credibly has (1-7). Specialty brands often have 1; generalists 2-5.",
        inputType: "angle_collection",
        required: true,
        defaultAngleCount: 3,
        angleSchema: [
          {
            key: "identity",
            label: "Identity",
            fields: [
              {
                key: "name",
                label: "Angle name",
                prompt:
                  "1-3 words to refer to this angle internally. Not customer-facing.",
                placeholder: "(e.g. cooking-first kitchens / heritage construction / weekday lunch)",
                kind: "text",
              },
            ],
          },
          {
            key: "wedge",
            label: "The wedge",
            description: "Your strategic stance for this angle.",
            fields: [
              {
                key: "what_we_do",
                label: "Strategic stance",
                prompt:
                  "2-3 words for your APPROACH to this kind of work — your philosophy, not your category.",
                placeholder: "(your stance for this angle)",
                kind: "text",
                required: true,
              },
              {
                key: "what_they_value",
                label: "What customers value most",
                prompt:
                  "Pick everything that matters to these customers, or add your own.",
                kind: "multi_picker",
                options: [
                  "Quality of result / craft",
                  "Reliability / consistency",
                  "Speed / fast turnaround",
                  "Cost-effectiveness",
                  "Customization / uniqueness",
                  "Convenience / minimal effort",
                  "Trust / relationship",
                  "Expertise / specialization",
                  "Status / prestige",
                ],
                required: true,
              },
              {
                key: "what_not_about",
                label: "What you DON'T optimize for",
                prompt:
                  "Pick the priorities you explicitly reject (multi-select). These define the wedge by what you refuse.",
                kind: "multi_picker",
                options: [
                  "Lowest price",
                  "Fastest turnaround",
                  "Largest scale / volume",
                  "Maximum customization",
                  "Mass appeal / one-size-fits-all",
                  "Status / prestige",
                  "Convenience above all",
                  "Standard / off-the-shelf approach",
                ],
                required: true,
              },
              {
                key: "design_constraint",
                label: "What you won't compromise on",
                prompt:
                  "5-7 words naming the thing every decision defers to. The non-negotiable.",
                placeholder: "(the thing every decision defers to)",
                kind: "text",
                required: true,
              },
            ],
          },
          {
            key: "contrast",
            label: "The contrast",
            description:
              "Who else customers might choose instead, and how you're different. Three short answers.",
            fields: [
              {
                key: "alt_archetype_1",
                label: "Alternative #1",
                prompt: "A kind of provider customers consider instead.",
                placeholder: "(an archetype they'd otherwise pick)",
                kind: "text",
                required: true,
              },
              {
                key: "alt_archetype_2",
                label: "Alternative #2 (optional)",
                prompt: "A second archetype if relevant.",
                placeholder: "(a second alternative)",
                kind: "text",
              },
              {
                key: "the_diff",
                label: "How you're different",
                prompt: "What you do that those alternatives don't (or won't).",
                placeholder: "(your distinguishing move)",
                kind: "text",
                required: true,
              },
            ],
          },
          {
            key: "example",
            label: "A specific recent example",
            description:
              "A real engagement that demonstrates this angle in action. Five short answers.",
            fields: [
              {
                key: "project_name",
                label: "Name or reference",
                prompt: "What you'd call this engagement in conversation.",
                placeholder: "(a memorable name or quick reference)",
                kind: "text",
                required: true,
              },
              {
                key: "customer_situation",
                label: "Customer situation",
                prompt: "What was happening when they came to you?",
                placeholder: "(their context when they reached out)",
                kind: "text",
                required: true,
              },
              {
                key: "what_they_needed",
                label: "What they needed",
                prompt: "The specific ask.",
                placeholder: "(what they came in asking for)",
                kind: "text",
                required: true,
              },
              {
                key: "what_we_did_differently",
                label: "What you did differently",
                prompt:
                  "What you did that an alternative provider wouldn't have done.",
                placeholder: "(your distinguishing move on this one)",
                kind: "text",
                required: true,
              },
              {
                key: "what_they_got",
                label: "What they got",
                prompt: "The outcome from the customer's perspective.",
                placeholder: "(what changed for them)",
                kind: "text",
                required: true,
              },
            ],
          },
          {
            key: "supplemental",
            label: "Supplemental signal (optional)",
            description:
              "Optional extra context. Skip if the wedge above already captures it.",
            fields: [
              {
                key: "for_whom",
                label: "Specifically WHO these customers are",
                prompt:
                  "Optional — fill ONLY if the values above don't capture demographic / life-stage / context signal (e.g. 'second-home owners with character properties' has more signal than the value list).",
                placeholder:
                  "(only if values miss demographic / context signal)",
                kind: "text",
              },
            ],
          },
          {
            key: "applies_to",
            label: "Applies to",
            description:
              "When does this angle apply? The orchestrator uses this to pick which angle frames each piece of content.",
            fields: [
              {
                key: "gbp_categories",
                label: "GBP categories",
                prompt:
                  "Which of your GBP categories does this angle cover? Pick all that apply.",
                kind: "gbp_categories_picker",
              },
              {
                key: "free_tags",
                label: "Tags (free-text, comma-separated)",
                prompt:
                  "Anything not covered by categories — customer types, contextual cues, situations.",
                placeholder: "(comma-separated tags)",
                kind: "text",
              },
            ],
          },
          {
            key: "motivation",
            label: "Why this angle matters (optional)",
            description: "Color for downstream composition. Optional.",
            fields: [
              {
                key: "text",
                label: "",
                prompt:
                  "In a sentence or two, why does this angle matter to you? What makes it click when you do this work?",
                kind: "textarea",
                rows: 2,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    key: "audience",
    domain: "strategic",
    label: "Audience",
    describes:
      "Three parts: (1) WHO you serve — specific buyer profile; (2) their PAINS — the ongoing problem state they're living with; and (3) their TRIGGERS — the specific moments or events that make them START looking right now. Triggers feed hooks.",
    media: ["text", "extracted"],
    lean: "declared",
    override: "flexible",
    phase: 2,
    inputs: [
      {
        key: "who",
        label: "Who you serve",
        prompt:
          "Specific buyer profile — segment, characteristics, what they own / do / value.",
        inputType: "prose",
        rows: 3,
        required: true,
      },
      {
        key: "pains",
        label: "Main pains",
        prompt:
          "List 3 main pains your clients live with — the ongoing problem state that has them stuck.",
        inputType: "list",
        slotCount: 3,
        qualifier: "main",
        required: true,
      },
      {
        key: "triggers",
        label: "Main triggers",
        prompt:
          "List 3 specific moments or events that make them START looking right now (these feed hooks).",
        inputType: "list",
        slotCount: 3,
        qualifier: "main",
        required: true,
      },
      {
        key: "example",
        label: "A specific client story",
        prompt:
          "Tell us about a recent client — what their situation was when they came to you.",
        inputType: "prose",
        rows: 4,
        required: true,
      },
    ],
  },
  {
    key: "proof",
    domain: "strategic",
    label: "Proof",
    describes:
      "Concrete RECEIPTS, not abstract claims. Four families: (1) signature work — specific named/described projects; (2) certifications — formal credentials; (3) measurable results — counts, durations, outcomes; (4) testimonials — direct client quotes. Values and stance belong in `positioning`/`tone`; here the answer is 'why should I believe you?' with artifacts. Bind reference photos of signature projects via the asset picker.",
    media: ["text", "asset"],
    lean: "declared",
    override: "flexible",
    phase: 4,
    inputs: [
      {
        key: "signature_projects",
        label: "Signature projects",
        prompt:
          "List 5 signature projects — named or briefly described. These ARE your proof, not abstract values.",
        inputType: "list",
        slotCount: 5,
        qualifier: "signature",
        required: true,
      },
      {
        key: "certifications",
        label: "Certifications",
        prompt:
          "List 5 formal certifications, credentials, or trade affiliations you hold.",
        inputType: "list",
        slotCount: 5,
        required: true,
      },
      {
        key: "results",
        label: "Measurable results",
        prompt:
          "List 3 measurable results — counts, durations, outcomes (e.g. '50+ years in business,' '150 historic restorations,' 'no warranty callbacks on plaster work in 10 years').",
        inputType: "list",
        slotCount: 3,
        required: true,
      },
      {
        key: "testimonials",
        label: "Testimonial quotes",
        prompt:
          "Paste 3 short testimonial quotes — actual words from clients you can point at.",
        inputType: "list",
        slotCount: 3,
        required: true,
      },
      {
        key: "example",
        label: "A featured project",
        prompt:
          "Tell us about one project in detail — what they came in with, what you did, what changed.",
        inputType: "prose",
        rows: 4,
        required: true,
      },
    ],
  },
  {
    key: "hooks",
    domain: "strategic",
    label: "Hooks",
    describes: "Proven opening angles / story templates (what has worked).",
    media: ["text", "extracted"],
    lean: "extracted",
    override: "flexible",
    phase: 4,
  },
  {
    key: "cta",
    domain: "strategic",
    label: "Call to action",
    describes:
      "Two parts: (1) the specific ACTION — the literal conversion mechanism (call, book a walkthrough, schedule a 30-min consult, email, fill out a form). For specialized/high-trust businesses this is usually a CONVERSATION, not a purchase. (2) the STYLE of the ask — warm vs urgent, open invitation vs qualifier-filtered ('if your project includes X…' filters out wrong-fit leads), and length (one-line button vs full paragraph). Copy gen turns the action into button text and the style into framing. The CTA is the CLOSE — it has to work after the reader has seen everything else.",
    media: ["text"],
    lean: "declared",
    override: "flexible",
    phase: 4,
    inputs: [
      {
        key: "action",
        label: "The action",
        prompt:
          "The literal conversion mechanism — call, book a walkthrough, schedule a 30-min consult, email, fill out a form. What's the specific next step?",
        inputType: "prose",
        rows: 2,
        required: true,
      },
      {
        key: "style",
        label: "The style of the ask",
        prompt:
          "Warm vs urgent · formal vs casual · open invitation vs qualifier-filtered ('if your project includes X…') · length (one-line button vs full paragraph).",
        inputType: "prose",
        rows: 2,
        required: true,
      },
      {
        key: "example",
        label: "Example wording",
        prompt:
          "If you have a preferred end-card phrase or CTA copy, paste it here.",
        inputType: "prose",
        rows: 3,
        required: true,
      },
    ],
  },

  // ── Visual — feeds keyframe / image generation ───────────────────────────
  {
    key: "aesthetic",
    domain: "visual",
    label: "Aesthetic",
    describes: "Overall look/feel descriptor (e.g. 'gritty, authentic').",
    media: ["text", "extracted"],
    lean: "extracted",
    override: "flexible",
    phase: 6,
  },
  {
    key: "environmental_look",
    domain: "visual",
    label: "Environmental look & feel",
    describes:
      "What the FRAME looks like when an environment is shot or rendered. Declared should name VISUAL TOKENS, not project categories (categories belong in `offer`): lighting (warm/cool/natural/dramatic/practical), materials (wood species, plaster, brass, marble, slate, brick), textures (matte/satin/patinated/hand-trowel), color palette tendencies, mood (lived-in/just-finished/mid-process/quiet authority). Reference assets carry the bulk of the signal — bind 3-5 representative photos; visual language is hard to type. Watch for words on the `avoid` baseline (e.g. 'luxury') sneaking back in here.",
    media: ["text", "asset", "extracted"],
    lean: "declared",
    override: "flexible",
    phase: 6,
  },
  {
    key: "subject_style",
    domain: "visual",
    label: "Subject style",
    describes: "How people/work appear and are framed (real crews, mid-action, un-posed).",
    media: ["text", "extracted"],
    lean: "extracted",
    override: "flexible",
    phase: 6,
  },
  {
    key: "palette",
    domain: "visual",
    label: "Palette",
    describes: "Brand colors (hex), extracted from logo/photos.",
    media: ["extracted", "text"],
    lean: "extracted",
    override: "guardrail",
    phase: 6,
  },
  {
    key: "logo",
    domain: "visual",
    label: "Logo",
    describes: "Logo asset(s) and usage rules.",
    media: ["asset"],
    lean: "declared",
    override: "guardrail",
    phase: 6,
  },
  {
    key: "do_not_show",
    domain: "visual",
    label: "Do not show",
    describes:
      "VISUAL anti-patterns — what should NEVER appear in generated/produced imagery. Guardrail: a brief can't override. Common families worth covering: (1) safety/compliance — crew without PPE, unsafe ladder/scaffold use, unsafe job sites; (2) competitor signage/vehicles/branding; (3) stock photography or AI-stock that obviously isn't your work; (4) sensitive content — children/clients without consent, identifying details; (5) genre-clashing imagery — reality-TV before/after composition, generic suburban settings for a heritage brand. As with `avoid`: state the REASON/pattern (e.g. 'cheapens craft,' 'compliance risk'), not just literal items — extraction generalizes from the pattern.",
    media: ["text"],
    lean: "declared",
    override: "guardrail",
    phase: 1,
  },

  // ── Sonic — feeds voiceover + music/SFX ──────────────────────────────────
  {
    key: "voiceover_character",
    domain: "sonic",
    label: "Voiceover character",
    describes:
      "TTS casting brief — concrete enough to match attributes to a voice catalog. Two layers: (1) PHYSICAL/CASTING ATTRIBUTES (gender, age range, accent/region, pace [deliberate/conversational/brisk], timbre [warm/deep/resonant/smooth/gravelly], delivery style [documentary-narrator/news-anchor/friend-on-the-job-site/measured-expert]) — these are the sortable hooks a TTS library actually uses to GENERATE a shortlist; (2) CHARACTER PROJECTION (the kind of person the voice should suggest — assured, empathic, technical, paternal, peer) — used to CONFIRM/grade the shortlist. Layer 1 generates candidates; Layer 2 picks the winner.",
    media: ["text"],
    lean: "declared",
    override: "flexible",
    phase: 7,
  },
  {
    key: "music_mood",
    domain: "sonic",
    label: "Music mood",
    describes:
      "Music selection brief — must be CONCRETE enough to query a music catalog (Epidemic Sound, Artlist, etc.). The articulation-gap descriptor: most owners can describe FEELING (peaceful, energetic, contemplative) but not MUSIC ATTRIBUTES (genre, tempo, instrumentation). Provide both. STRUCTURED signal: genre (acoustic singer-songwriter / cinematic orchestral / indie folk / ambient electronic / etc.), tempo (slow ~60-80 BPM / mid 80-110 / upbeat 110+), instrumentation (acoustic guitar, piano, strings, orchestra, percussion, pad), era/style reference, energy curve (steady / builds to swell / gradual reveal). AD-LIB signal: target feeling in plain language. **Reference tracks (bound assets) are the gold-standard input** — 3-5 representative tracks beat any paragraph of description. When pickers ship, this descriptor + voiceover_character get them first.",
    media: ["text", "asset"],
    lean: "declared",
    override: "flexible",
    phase: 7,
  },
  {
    key: "sfx_style",
    domain: "sonic",
    label: "SFX style",
    describes:
      "Sound-effect palette. Critical axis: DIEGETIC (sounds from the scene itself — the hammer, the plane, the trowel, the level click) vs DESIGNED (added at edit — whooshes, hits, pads, risers). For craft/heritage brands, diegetic is enormously powerful — communicates authenticity in a way abstract sound design can't. Other axes: volume (subtle/moderate/punchy), texture (organic-textural / mechanical / electronic / cinematic), frequency (sparse-accents / moderate-transitions+actions / dense-bed). Owner-articulation gap is real (most can't describe SFX technically) — picker candidate.",
    media: ["text"],
    lean: "declared",
    override: "flexible",
    phase: 7,
  },
  {
    key: "pronunciation",
    domain: "sonic",
    label: "Pronunciation",
    describes:
      "TTS / VO pronunciation overrides — a guardrail extraction can't change. Two parts: (1) the brand itself (be explicit about ambiguous letters — TTS often mispronounces single-letter prefixes; spell it out: 'B as bee, not buh'); (2) industry/proper-noun lexicon — terms TTS routinely trips on. Common families to cover: architectural ('Beaux-Arts → BOH-zar', 'Italianate → i-TAL-yan-ate', balustrade, fenestration, escutcheon, voussoir), trade/technical (hydronic, parapet, muntin, lintel), and any unusual local proper nouns. Provide phonetic spelling (rough syllabic form is enough — IPA not required) for anything that isn't dictionary-standard. Decomposed-input pattern fits well: rows of (term, phonetic) + a general-rule fallback.",
    media: ["text", "extracted"],
    lean: "declared",
    override: "guardrail",
    phase: 7,
  },

] as const;

export type DescriptorId = `${BrandDomain}.${string}`;

export const descriptorId = (d: DescriptorSpec): DescriptorId =>
  `${d.domain}.${d.key}`;

const BY_ID: ReadonlyMap<string, DescriptorSpec> = new Map(
  BRAND_DESCRIPTOR_CATALOG.map((d) => [descriptorId(d), d]),
);

/** Look up a catalog descriptor by its full `${domain}.${key}` id. */
export function getDescriptor(id: string): DescriptorSpec | undefined {
  return BY_ID.get(id);
}

const BY_KEY: ReadonlyMap<string, DescriptorSpec> = new Map(
  BRAND_DESCRIPTOR_CATALOG.map((d) => [d.key, d]),
);

/** Look up a catalog descriptor by its bare key (catalog keys are globally unique). */
export function getDescriptorByKey(key: string): DescriptorSpec | undefined {
  return BY_KEY.get(key);
}

export function descriptorsByDomain(domain: BrandDomain): DescriptorSpec[] {
  return BRAND_DESCRIPTOR_CATALOG.filter((d) => d.domain === domain);
}

/** Guardrail descriptors a brief can never override (the brand-safety contract). */
export function guardrailDescriptors(): DescriptorSpec[] {
  return BRAND_DESCRIPTOR_CATALOG.filter((d) => d.override === "guardrail");
}

/** Declared-led descriptors = the onboarding/brand-wizard questions to ask. */
export function declaredDescriptors(): DescriptorSpec[] {
  return BRAND_DESCRIPTOR_CATALOG.filter((d) => d.lean === "declared");
}

/** Extracted-led descriptors = what the system learns from the substrate. */
export function extractedDescriptors(): DescriptorSpec[] {
  return BRAND_DESCRIPTOR_CATALOG.filter((d) => d.lean === "extracted");
}
