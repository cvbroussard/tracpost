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

export type BrandDomain = "verbal" | "strategic" | "visual" | "sonic" | "motion";

export const BRAND_DOMAINS: readonly BrandDomain[] = [
  "verbal",
  "strategic",
  "visual",
  "sonic",
  "motion",
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
 */
export type InputType = "prose" | "list";

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
export type DescriptorPhase = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export const PHASE_LABELS: Record<DescriptorPhase, string> = {
  1: "Foundation",
  2: "Strategic Foundations",
  3: "Positioning",
  4: "Strategic Application",
  5: "Voice Details",
  6: "Visual Identity",
  7: "Motion Identity",
  8: "Sonic Identity",
};

export const PHASE_DESCRIPTIONS: Record<DescriptorPhase, string> = {
  1: "Foundational voice + guardrails. No upstream dependencies. Fill first.",
  2: "Who we serve + what we offer. Depends on Phase 1.",
  3: "Strategic differentiation (wedge / contrast / example). Depends on Phase 1, 2, and GBP categories.",
  4: "Tactical surfaces that consume positioning (proof, hooks, CTA, tagline).",
  5: "Supplemental voice details (lexicon, mechanical style).",
  6: "Visual brand band — aesthetic, environment, subjects, palette, logo.",
  7: "Motion identity (pacing, transitions, camera, overall feel).",
  8: "Sonic identity (voiceover, music, sfx, pronunciation).",
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
      "The wedge — what makes this brand a different KIND of choice, not just 'better.' Sharpest when stated as a contrast: what most others in your category do (or refuse) vs. what you do (or refuse). The stance that gets you chosen vs. ignored.",
    media: ["text"],
    lean: "declared",
    override: "flexible",
    phase: 3,
    inputs: [
      {
        key: "wedge",
        label: "The wedge",
        prompt:
          "What makes you a DIFFERENT KIND of choice — not just 'better'? Sharpest as a contrarian stance or sharp identity.",
        inputType: "prose",
        rows: 3,
        required: true,
      },
      {
        key: "contrast",
        label: "The contrast",
        prompt:
          "Most others in your category do (or refuse) X. You do (or refuse) Y. State it explicitly.",
        inputType: "prose",
        rows: 3,
        required: true,
      },
      {
        key: "example",
        label: "A specific example",
        prompt:
          "Describe a project or client situation that exemplified your positioning in action — in your own voice.",
        inputType: "prose",
        rows: 4,
        required: true,
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
    phase: 8,
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
    phase: 8,
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
    phase: 8,
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
    phase: 8,
  },

  // ── Motion / editorial — feeds the Director / video assembly ─────────────
  {
    key: "pacing",
    domain: "motion",
    label: "Pacing",
    describes:
      "Brand-level DISPOSITION for tempo — NOT shot-by-shot lengths (that's the creative brief). Answer with a posture: 'calm and considered — long holds, sparse cuts, steady energy' OR 'punchy and energetic — short shots, frequent cuts' OR 'cinematic build — slow open that gradually accelerates.' The brief translates this into specific shot lengths/counts/energy-curves per ad. Picker candidate at the disposition level. Watch the `avoid` baseline — 'premium' is a common reach here that's on the HGTV cliche list.",
    media: ["text"],
    lean: "declared",
    override: "flexible",
    phase: 7,
  },
  {
    key: "transitions",
    domain: "motion",
    label: "Transitions",
    describes:
      "Brand-level DISPOSITION for how shots connect — NOT cut-by-cut decisions (that's the creative brief). Answer with a posture: 'cuts-only, minimal designed treatment' OR 'mostly smooth dissolves' OR 'transition-heavy with branded graphics.' The brief picks specific cut style per transition within this range. Vocabulary that lives at the brief layer: hard cuts, smooth dissolves, cross-fades, match cuts, whip-pans, J-cuts (audio leads next shot), L-cuts (audio trails prior). Strong picker candidate at the disposition level.",
    media: ["text"],
    lean: "declared",
    override: "flexible",
    phase: 7,
  },
  {
    key: "camera_style",
    domain: "motion",
    label: "Camera style",
    describes:
      "Brand-level DISPOSITION for camera motion — NOT shot-by-shot directives (that's the creative brief). Answer with a posture/range, not specific moves: 'static-dominant with slow purposeful moves' OR 'energetic handheld with whip-pans' OR 'cinematic dolly + crane work.' The brief picks specific moves per shot within this range. Not photography setup either (lens/grading/lighting belong in `environmental_look`). Move vocabulary that lives at the brief layer: static, slow push, slow pull, slow dolly, slow rise/descend, handheld, whip-pan. Calm brands lean static + slow push/pull as a posture; punchy brands lean handheld + whip-pans. Picker candidate at the disposition level.",
    media: ["text"],
    lean: "declared",
    override: "flexible",
    phase: 7,
  },
  {
    key: "overall_feel",
    domain: "motion",
    label: "Overall feel",
    describes:
      "The one-line editorial north star you'd tape to a monitor while editing. Strongest when stated as a FORMAT-APPROPRIATE reference genre: 'feels like an Architectural Digest video tour' / 'feels like a Hermès craft film' / 'feels like an Apple product reveal' / 'feels like This Old House classic.' Each reference maps to a whole stack of production attributes (pacing, camera, music, VO register) the brief can default from. Avoid format-mismatched analogues — construction documentation is long-form/instructional and doesn't translate to a 15s premium ad. Strong picker candidate (single-select reference chips). Watch the `avoid` baseline — 'high-end'/'premium'/'luxury' all live on the HGTV cliche list.",
    media: ["text"],
    lean: "declared",
    override: "flexible",
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
