# Ad-Craft Template Catalog

**Status:** Research deliverable, draft 1 · 2026-05-25
**Purpose:** Establish the canonical advertising frameworks TracPost will codify as `format_templates`. Each framework represents decades of industry-validated structure for short-form video collateral. Implementation work (format_template engine, shot-role mapping, asset selection logic) draws from this catalog.

---

## Why this catalog exists

We've been deriving multi-shot composition architecture from first principles via the Luma analysis. That analysis was useful but it was reverse-engineering one production team's choices — Luma themselves are applying established ad-craft, not inventing it. This document goes upstream to the source: the established advertising frameworks that the entire industry (including Luma) draws from.

**Once codified, these frameworks become TracPost's `format_templates` — the named story patterns the orchestrator picks from when producing collateral.** Each template prescribes structure, pacing, component roles, and best practices that have been A/B tested across millions of ads. Implementation becomes mechanical because the design decisions have already been made by the industry.

This is the foundation for the storyboard-driven generation architecture per [[tracpost-multi-shot-architecture-intent]].

---

## Universal principles (cross-framework)

These appear in every modern framework and across every platform's published guidance. Treat as non-negotiable defaults:

### 1. The first 3 seconds are the entire ad
- **TikTok:** "The first three seconds determine whether a user keeps watching or instantly scrolls away."
- **Meta:** "63% of top-performing ads deliver their core message within the first three seconds."
- **YouTube ABCDs:** "Emerging story arc" — start strong, no slow build.
- Users who watch 3s have ~50% probability of watching 30s (Meta).
- 90% of ad recall impact is captured within the first 6 seconds (TikTok).

**Implication:** Every shot list must front-load the hook. No setup-then-payoff structures that withhold value until second 8. The hook IS the ad; everything else is supporting material.

### 2. Brand integration throughout, not at the end
- YouTube ABCDs: "Thoughtful brand integration throughout videos, not just at the end."
- Meta: "Brand or product appears within the first 3 seconds."
- Studies consistently show late-only branding loses attribution — viewers remember the ad but not who ran it.

**Implication:** Branding (logo, wordmark, brand color, voice) should be detectable in shot 1, not just shot 5.

### 3. Sound-off by default
- Meta: "Design for silent viewing since 85% watch without sound."
- Bold captions boost silent-view retention by over 12% in view time (Meta internal data).

**Implication:** Captions are not optional. Visual storytelling must work without audio. Audio is enhancement, not foundation.

### 4. Pattern interrupt cadence
- TikTok: "Switch camera angles, scenes, or visuals every 2-3 seconds to maintain attention."
- Cuts are the editorial mechanism for sustaining attention; without them, viewers drift around 4-5 seconds into a static shot.

**Implication:** Validates our 5×3s multi-shot architecture — cuts every 3s sit inside the attention-cycle window. Single-clip 5s posts fail this principle.

### 5. Clear, specific CTA
- AIDA, PAS, BAB, SB7, ABCDs all converge: the close must instruct, not suggest.
- Verb-first. One action. Concrete destination.
- Action-oriented overlays ("Shop now," "Learn more," "Get yours") increase conversion 18%+ (TikTok).

**Implication:** CTA is a required slot, not optional. Caption + on-screen text + visual destination all reinforce the same action.

### 6. One core message per ad
- AIDA, ABCDs, every modern guide: don't multi-task within an ad.
- One problem. One solution. One CTA.

**Implication:** Format templates should resist "and also feature X" extensions. Multi-message ads dilute conversion across all messages.

---

## The Catalog

Seven frameworks, ordered from most-prescriptive (modern platform-specific) to most-narrative (classic storytelling):

1. [Meta 3-3-3 Rule](#1-meta-3-3-3-rule) — short-form social platform tactical structure
2. [YouTube ABCDs](#2-youtube-abcds) — Google's validated principles framework
3. [TikTok Hook-Body-Close](#3-tiktok-hook-body-close) — TikTok-native structure
4. [PAS — Problem / Agitate / Solution](#4-pas--problem--agitate--solution) — direct-response classic
5. [AIDA — Attention / Interest / Desire / Action](#5-aida--attention--interest--desire--action) — funnel-stage classic (1898)
6. [Before / After / Bridge (BAB)](#6-before--after--bridge-bab) — transformation storytelling
7. [StoryBrand SB7](#7-storybrand-sb7) — modern narrative framework (Donald Miller)

---

### 1. Meta 3-3-3 Rule

**Origin:** Meta (Facebook/Instagram) creative team, codified as guidance to ad buyers.
**Best for:** Reels, Stories, Feed video ads. The default tactical structure for short-form social.
**Duration:** 9 seconds minimum, 15-30 seconds typical.

#### Component breakdown

| Slot | Duration | Component | Role |
|---|---|---|---|
| 1 | 0–3s | **Hook** | Capture attention; deliver core message preview; brand visible |
| 2 | 3–6s+ | **Message body** | Communicate the value proposition; demonstrate the product/service |
| 3 | Final 3s | **CTA** | Direct the next action with clear verb + destination |

The "3-3-3" name refers to the three critical 3-second windows. The middle "message body" can be longer than 3 seconds; the hook and CTA are fixed at ~3s each.

#### Per-component prescriptions

**Hook (0-3s):**
- Brand, product, or most eye-catching shot appears in first 3 seconds
- Visible motion preferred over static first frame (product handling, face to camera, in-use moment)
- Problem-first open or immediate-outcome open both validated
- Fast on-screen text — sound-off legible

**Message body:**
- Maintain visible motion / cuts every 2-3s
- Sustain captions throughout
- Demonstrate, don't describe

**CTA (final 3s):**
- Verb-first text overlay
- Concrete destination (URL, profile, swipe-up)
- Brand wordmark anchored to CTA frame

#### TracPost mapping

This is the **baseline template for all motion collateral**. Almost any service-business video ad fits this structure as a default. Maps to a 5×3s multi-shot composition:

- Shot 1 (Hook): brand-visible establishing shot with motion
- Shots 2-4 (Body): demonstration / process / result shots
- Shot 5 (CTA): clean hold with overlay

**Sources:** Meta Creative Best Practices, [LeadsBridge Meta Ads Best Practices 2026](https://leadsbridge.com/blog/meta-ads-best-practices/), [Flighted 7 Meta Ads Creative Strategies 2026](https://www.flighted.co/blog/7-meta-ads-creative-strategies-that-work)

---

### 2. YouTube ABCDs

**Origin:** Google / YouTube creative research with Ipsos, validated by Nielsen + Kantar.
**Best for:** YouTube ads (pre-roll, in-stream, Shorts) and longer-form video ads. The most rigorously validated framework — proven 30% short-term sales lift and 17% long-term brand contribution.
**Duration:** 6 seconds to 60+ seconds. Scales across formats.

#### The Four Principles

| Letter | Principle | What it means |
|---|---|---|
| **A** | **Attention** | Adopt "emerging story arc" — start strong with tight framing, humanized elements, surprising visuals, faster pacing. No slow build. |
| **B** | **Branding** | Thoughtful brand integration throughout — not just at the end. Correlates with ad recall, consideration, and purchase intent. |
| **C** | **Connection** | Don't treat viewers as passive — educate, inspire, or entertain. Humanize the story. Lean into emotion (humor, surprise). |
| **D** | **Direction** | Clear simple instructions for what to do next. Written CTA + graphics + audio + scene from story all reinforce the action. |

#### Per-principle prescriptions

**Attention:**
- Tight framing on subject from frame 1
- Humanized element early (face, hands, person)
- Faster pacing than traditional commercial editing
- Surprising or unexpected visual element

**Branding:**
- Brand presence in opening, middle, AND closing — not delayed
- Visual brand elements (logo, color, product) interleaved with narrative
- Verbal brand mention when audio is on
- Brand IS part of the story, not a tag

**Connection:**
- Humanize subjects (real people, real moments)
- Story has stakes the viewer can relate to
- Emotional levers used deliberately (humor, surprise, awe, empathy)
- Treat viewer as an active participant

**Direction:**
- CTA explicitly stated, not implied
- Multiple reinforcement modes (text overlay + voiceover + visual)
- One action only — don't fork the CTA
- Friction-reducing language ("Tap to learn more" beats "Visit our website")

#### TracPost mapping

The most rigorously validated framework — and the principles themselves are checklist-friendly. Less a *shape* than a *quality bar*. Every TracPost-produced piece should clear ABCD as a baseline:

- A: Open with motion + tight framing on subject (worker, finished install, product detail)
- B: Brand element (subscriber's logo, brand color, business name) visible across multiple shots
- C: Human element in frame (subscriber's worker, customer reaction, the human reality of the work)
- D: Final shot is CTA with explicit text overlay + verbal/visual reinforcement

**ABCD acts as a QA gate** for any template's output. Multi-shot composition should pass an ABCD check before publish.

**Sources:** [Google Ads Help — ABCDs of effective video ads](https://support.google.com/google-ads/answer/14783551), [Think with Google — YouTube ABCDs](https://www.thinkwithgoogle.com/future-of-marketing/creativity/youtube-video-ad-creative/), [Google Business — ABCDs Guide](https://business.google.com/us/resources/articles/abcds-of-effective-video-ads/)

---

### 3. TikTok Hook-Body-Close

**Origin:** TikTok For Business creative team, codified as best-practice guidance.
**Best for:** TikTok, Reels, Shorts — TikTok-native aesthetic and pacing.
**Duration:** 9-30 seconds, typically 15s sweet spot.

#### Component breakdown

| Slot | Duration | Component | Role |
|---|---|---|---|
| 1 | 0–3s | **Hook** | Pattern interrupt; create immediate curiosity gap |
| 2 | 3-12s | **Body** | Convey brand message; demonstrate; tell story |
| 3 | Final 2-3s | **Close** | Anchor with strong CTA |

#### Per-component prescriptions

**Hook techniques (validated by TikTok creative team):**
- **Visual hooks:** unexpected movement, striking visual, surprising scene that breaks scrolling flow
- **Auditory hooks:** sound effect or bold opening statement creating curiosity gap
- **Problem-first openers:** "Why your [common thing] is failing"
- **Question openers:** "Ever wondered why..."
- **Surprising statements:** counter-intuitive claim
- **Pattern interrupts:** visual contradiction of expected scrolling content

**Body:**
- Visual cuts every 2-3 seconds (cadence rule)
- Native aesthetic — looks like UGC, not polished commercial (TikTok-specific)
- Multiple camera angles / scenes within body
- Captions sustained throughout
- Body conveys ONE message — don't multi-task

**Close:**
- Action-oriented overlay ("Shop now," "Learn more," "Get yours") — 18%+ conversion lift
- Verb-first
- Concrete destination
- Brand wordmark anchored to CTA

#### TikTok-specific notes worth flagging

- **Hook variations:** TikTok creative best practice is to produce 3-5 distinct hook variations for the same body+CTA. We should plan for hook-variant A/B testing as a feature, not an afterthought.
- **Native aesthetic preference:** Over-polished commercial-style ads underperform on TikTok. The "handheld documentary" register (matches Kling V2.1 Master's natural register per [[tracpost-video-producer-evaluation]]) is platform-aligned.
- **No traditional ad opening:** No logos, no "introducing," no slow brand build. Hook is *content*, not *brand throat-clearing*.

#### TracPost mapping

This is the **TikTok-tuned variant of the Meta 3-3-3 baseline**. Same 3-slot shape, sharper hook discipline, native-aesthetic preference. For TracPost subscribers publishing to TikTok specifically:
- Reduce overt brand polish in the hook (no logo-first opens)
- Prefer documentary/handheld register
- Plan multiple hook variations for A/B testing

**Sources:** [TikTok Ads Help — Creative Best Practices](https://ads.tiktok.com/help/article/creative-best-practices), [TikTok For Business — Creative Best Practices Blog](https://ads.tiktok.com/business/en-US/blog/creative-best-practices-top-performing-ads), [Sovran TikTok Creative Best Practices 2026](https://sovran.ai/blog/tiktok-creative-best-practices), [Stackmatix TikTok Ad Creative 2026](https://www.stackmatix.com/blog/tiktok-ad-creative-best-practices-2026), [TikTok Creative Codes](https://ads.tiktok.com/business/en/creative-codes)

---

### 4. PAS — Problem / Agitate / Solution

**Origin:** Direct-response copywriting tradition; widely attributed to mid-20th-century mail-order advertising.
**Best for:** Pain-point-driven products and services. Strong for service businesses (contractors, plumbers, repair, professional services) where customer comes with a problem.
**Duration:** Highly flexible — 9-30s for short-form video.

#### Component breakdown

| Slot | Duration | Component | Role |
|---|---|---|---|
| 1 | 0–3s | **Problem** | Identify specific pain point — create immediate relevance |
| 2 | 3–10s | **Agitate** | Amplify the pain; introduce scenario making it worse; build emotional discomfort |
| 3 | 10–15s | **Solution** | Reveal the solution (your product/service) as the relief |

#### Per-component prescriptions

**Problem (0-3s):**
- Name the specific pain point in plain language
- Visual representation of the problem state (cracked driveway, leaky faucet, dated kitchen)
- Build immediate relevance — viewer thinks "yes, I have that problem"
- Function as the hook — front-load specificity

**Agitate (3-10s):**
- Show the problem in worse states (water damage spreading, mold, costly repairs)
- Imply consequences ("this is what happens if you wait")
- Build emotional discomfort
- DO NOT moralize — show, don't lecture

**Solution (10-15s):**
- Reveal your service/product as the relief
- Show before-to-after transition
- CTA built into the solution moment ("we fix this — call today")
- Clear next action

#### Why PAS is strong for TracPost

This is **arguably the most TracPost-native framework**, because most service businesses ARE problem-solvers:

- Roofer: "leaking roof → water damage spreading → we replace it"
- Plumber: "low water pressure → costly hidden leaks → we diagnose and fix"
- HVAC: "old AC → climbing utility bills + unsafe summer → new efficient system"
- Kitchen remodeler: "dated kitchen → embarrassing to host, no resale value → modernization"

The subscriber's asset library *already contains* PAS material naturally — before-state photos, mid-work photos, after-state photos. The orchestrator can match these to PAS slots without subscriber direction.

#### TracPost mapping

| Slot | Asset source from pool |
|---|---|
| Problem | "Before" / damaged / dated state photos |
| Agitate | Detail close-ups of damage; process shots during demolition |
| Solution | Finished result / after photos; happy customer; final reveal |

**This is the format template most likely to perform well as a Phase 1 default for service-business subscribers.**

**Sources:** [SaaS Funnel Lab PAS 2025](https://www.saasfunnellab.com/essay/pas-copywriting-framework/), [Omniscient Digital PAS Copywriting](https://beomniscient.com/blog/pas-copywriting/), [Pageblock PAS Framework](https://pageblock.io/resources/framework/pas), [Crazy Egg — PAS Without Being Cringy](https://www.crazyegg.com/blog/pas-framework/)

---

### 5. AIDA — Attention / Interest / Desire / Action

**Origin:** Elias St. Elmo Lewis, 1898. The oldest validated framework in advertising — over a century of continuous use.
**Best for:** Consumer-facing brand awareness ads; products with aspirational or lifestyle pull. Less ideal for pure service businesses (PAS fits better there).
**Duration:** Highly flexible — 15-60s typical for video.

#### Component breakdown

| Slot | Duration | Component | Role |
|---|---|---|---|
| 1 | 0–3s | **Attention** | Hook — visual or copy that disrupts the scroll |
| 2 | 3–8s | **Interest** | Engage with facts, story, or information that holds attention |
| 3 | 8–13s | **Desire** | Show transformation / aspiration — what life looks like after |
| 4 | 13–15s | **Action** | One clear next step |

#### Per-component prescriptions

**Attention:**
- Punchy opening — title, visual, or surprising moment
- Sound-off legible
- Doesn't have to be cleverly branded — has to STOP scroll

**Interest:**
- Facts that engage the rational mind
- "Why this is worth watching" — the answer to "so what?"
- Specificity over generality
- Show the product/service in context

**Desire:**
- Show how life is *different* after the product
- Find the deep emotional benefit
- Aspirational visual — what the customer wants to BE/HAVE
- This is where transformation lives

**Action:**
- ONE clear next step (only one)
- Friction-reducing language
- Brand wordmark + destination
- Visible CTA element (button, swipe, link)

#### TracPost mapping

AIDA works well for **luxury / premium service** subscribers where aspiration is the buying motive — not pain relief:

- Luxury kitchen remodeling: "Attention: stunning finished kitchen. Interest: craftsmanship details. Desire: 'this could be your morning routine.' Action: 'book consultation.'"
- High-end landscaping: similar aspirational arc
- Custom homes / luxury renovations: classic AIDA territory

For pain-point service businesses (plumbing, roofing, HVAC), PAS will typically outperform AIDA because pain motivates action faster than aspiration.

#### Subscriber category fit

| Category | AIDA fit |
|---|---|
| Luxury kitchen/bath remodeling | ✓ Strong |
| Custom home building | ✓ Strong |
| High-end landscaping | ✓ Strong |
| Interior design | ✓ Strong |
| General contractor (mid-market) | ⚠ Mixed (PAS likely better) |
| Emergency services (plumbing/HVAC) | ✗ Use PAS |
| Repair services | ✗ Use PAS |

**Sources:** [Wikipedia — AIDA marketing](https://en.wikipedia.org/wiki/AIDA_(marketing)), [Siege Media — AIDA Model](https://www.siegemedia.com/creation/aida-model), [Copy Hackers — AIDA](https://copyhackers.com/2023/03/attention-interest-desire-action/), [Crazy Egg — AIDA Formula](https://www.crazyegg.com/blog/aida-copywriting-formula/), [Smart Insights — AIDA model](https://www.smartinsights.com/traffic-building-strategy/offer-and-message-development/aida-model/)

---

### 6. Before / After / Bridge (BAB)

**Origin:** Direct-response marketing tradition.
**Best for:** Transformation-driven services where there's a clear visual delta between before-state and after-state. **The format-template equivalent of TracPost's bread-and-butter content.**
**Duration:** 9-30s typical.

#### Component breakdown

| Slot | Duration | Component | Role |
|---|---|---|---|
| 1 | 0–3s | **Before** | Current pain/problem state — visual + relatable |
| 2 | 3–10s | **After** | Ideal scenario — the transformation |
| 3 | 10–15s | **Bridge** | Why YOU are the path — social proof + CTA |

#### Per-component prescriptions

**Before:**
- Quickly establish the problem state visually
- Empathy — show the relatable struggle/situation
- Don't dwell — get to the After quickly
- This is the hook

**After:**
- Present the ideal outcome
- Show the transformation, not just the result
- Visually demonstrate the benefit
- Emotional appeal — how it FEELS to be in the After state

**Bridge:**
- Position the brand as the proven way to get from Before to After
- Social proof if possible (testimonial, results, reviews)
- CTA — clear path to engagement
- Verb-first

#### Why BAB is foundational for TracPost

**This is the most natural fit for service business content production.** Most service businesses ARE transformation businesses — the customer pays for the delta between Before and After:

- Contractor: dated kitchen → modern kitchen
- Landscaper: overgrown yard → designed outdoor space
- Painter: tired paint → fresh finish
- Detailer: dirty car → showroom-ready
- Cleaner: cluttered space → organized space
- Renovator: water-damaged room → restored room

The subscriber's asset library naturally contains Before/After material from every job. **BAB is probably the highest-volume format template TracPost will produce.**

#### TracPost mapping

| Slot | Asset source from pool |
|---|---|
| Before | "Before" photos (Vision-tagged as before-state via composition, lack of finish, demo signals) |
| After | Finished hero shots (Vision-tagged as after-state via composition quality, completion signals) |
| Bridge | Action shots + brand element + CTA card |

**The asset role-fitness Vision extension (per the multi-shot architecture intent) should specifically tag for "before-state" and "after-state" composition signals to enable this template.**

#### Comparison with PAS

PAS and BAB are structurally similar but with different emphasis:

| | PAS | BAB |
|---|---|---|
| Emphasis | Pain → Relief | Current → Transformed |
| Tone | Urgency-driven | Transformation-driven |
| Best for | Problem-aware buyers | Aspiration-driven buyers |
| Time on problem | More (agitate stage) | Less (quick before) |
| Service fit | Emergency / pain-point | Renovation / improvement |

For a roofer: **PAS** (your roof is leaking → water damage spreading → we fix it).
For a kitchen remodeler: **BAB** (dated kitchen → dream kitchen → here's how).

**Sources:** [Pageblock — BAB Framework](https://pageblock.io/resources/framework/bab), [StoryPrompt — Before After Bridge](https://www.storyprompt.com/blog/before-after-bridge), [Campaign Monitor — BAB Copywriting](https://www.campaignmonitor.com/email/bab-copywriting/), [BlackSheep Creative — BAB Framework](https://blaksheepcreative.com/digital-marketing/content-marketing/copywriting/before-after-bridge/)

---

### 7. StoryBrand SB7

**Origin:** Donald Miller, "Building a StoryBrand" (2017). Modern narrative framework drawing from mythology/storytelling theory.
**Best for:** Brand-defining content — about pages, hero videos, longer-form storytelling. Less ideal for 15s social ads (too many slots for that runtime).
**Duration:** 30-90s for full SB7; can compress to 15s with reduced fidelity.

#### Component breakdown (7 parts)

| Slot | Component | Role |
|---|---|---|
| 1 | **Character (Customer)** | The customer is the hero, NOT your brand. Show who has the problem. |
| 2 | **Problem** | External (what's happening) + Internal (how it feels) + Philosophical (why it matters) |
| 3 | **Guide (Your Brand)** | Your brand appears as the experienced helper, not the hero |
| 4 | **Plan** | The simple path — what to do next, breaks through confusion |
| 5 | **Call to Action** | Clear, actionable next step |
| 6 | **Avoid Failure** | What customer stands to lose if they don't act (stakes) |
| 7 | **Success** | Picture of life after the problem is solved (aspirational outcome) |

#### Critical insight: customer = hero, brand = guide

This is the framework's most important contribution. Most amateur ads make the brand the hero ("WE are amazing"). SB7 inverts: the customer is Luke Skywalker; your brand is Obi-Wan. The story is about the customer's transformation; the brand is the wise helper who makes it possible.

**For TracPost subscribers, this is doubly important.** A contractor's video shouldn't be about how amazing the contractor is — it should be about the homeowner whose dream kitchen got built. The contractor is the *guide* who made it possible.

#### Per-component prescriptions

**Character:**
- Open with the customer (or their context), not the brand
- Visual = customer's world (their home, their family, their situation)

**Problem:**
- Three layers — external (the leaky roof), internal (the worry), philosophical (no family should have to deal with this)
- Most effective ads name at least two of the three

**Guide:**
- Brand introduction — but as supporter, not star
- Authority signals (experience, results, expertise) — but in service of helping
- Empathy first ("we understand"), authority second ("here's how we help")

**Plan:**
- 3-step process typically ("Step 1: call us. Step 2: we assess. Step 3: we fix.")
- Reduces friction by clarifying what happens
- Visual representation of the simple path

**Call to Action:**
- Direct CTA (primary action) + Transitional CTA (lower-commitment alternative)
- Direct: "Book a consultation"
- Transitional: "Download our guide" / "See our portfolio"

**Avoid Failure:**
- What's at stake if they don't act
- Doesn't have to be dire — just real
- "Don't spend another summer with a broken AC"

**Success:**
- Aspirational outcome — what life looks like after
- Tie to deeper desire (peace of mind, pride, freedom from stress)
- Visual representation of the success state

#### TracPost mapping

SB7 is rich but probably **better suited to longer-form content** than 15s social ads:

| Content type | SB7 fit |
|---|---|
| Brand video on website hero (60-90s) | ✓ Excellent |
| Subscriber's "About" page video | ✓ Excellent |
| Customer testimonial / case study (60s+) | ✓ Excellent |
| 15s social Reel | ⚠ Compressed — drop slots 6-7 |
| 9s TikTok Reel | ✗ Too many components |

**Implementation note:** For TracPost, SB7 is probably a "premium template" for longer-form output (project case studies, anchor page hero videos), not a primary social-feed template. The 7 slots compress poorly into 9-15 seconds. PAS and BAB are better-fit for the high-volume social-feed output; SB7 fits the lower-volume premium content tier.

**Sources:** [Creativeo — StoryBrand Framework Guide](https://www.creativeo.co/post/storybrand-framework), [Well Dressed Walrus — 7 Parts of StoryBrand](https://welldressedwalrus.com/7-parts-of-a-storybrand-framework/), [IMPACT — What is StoryBrand](https://www.impactplus.com/learn/what-is-the-storybrand-framework), [Gravity Global — StoryBrand 7-Part Guide](https://www.gravityglobal.com/blog/complete-guide-storybrand-framework)

---

## Cross-framework comparison

| Framework | Slots | Best Duration | Subscriber Fit | TracPost Priority |
|---|---|---|---|---|
| Meta 3-3-3 | 3 | 9-30s | Universal baseline | **P1 baseline** |
| YouTube ABCDs | (Principles, not slots) | 6-60s | QA gate for all | **P1 QA layer** |
| TikTok Hook-Body-Close | 3 | 9-30s | TikTok platform | **P2 platform-specific** |
| PAS | 3 | 9-30s | Pain-point services | **P1 service businesses** |
| AIDA | 4 | 15-60s | Luxury / aspirational | **P2 luxury tier** |
| BAB | 3 | 9-30s | Transformation services | **P1 contractors/remodelers** |
| StoryBrand SB7 | 7 | 30-90s | Brand/about content | **P3 longer-form premium** |

---

## Mapping to TracPost subscriber categories

### Service business with pain-driven customers (plumbing, HVAC, roofing, emergency repair)
- **Primary:** PAS (urgency drives conversion)
- **Secondary:** BAB (when transformation is visual)
- **CTA priority:** "Call now," "Get a quote today"

### Transformation service business (kitchen/bath remodeling, painting, landscaping, detailing)
- **Primary:** BAB (before/after is the entire pitch)
- **Secondary:** PAS (for dramatic transformations with pain framing)
- **CTA priority:** "See our portfolio," "Book a consultation"

### Luxury / premium service (custom homes, high-end interior design, luxury renovations)
- **Primary:** AIDA (aspiration drives premium buyers)
- **Secondary:** SB7 (for longer-form brand stories)
- **CTA priority:** "Book a consultation," "Tour our showroom"

### Universal baseline (all categories, default if no specific signal)
- **Meta 3-3-3** as the structural baseline
- **ABCDs** as the always-applied QA gate
- **One of PAS/BAB/AIDA** layered on top based on subscriber category

### Platform-specific routing
- TikTok output: apply **TikTok Hook-Body-Close** discipline on top of base framework (native aesthetic, hook variation count, no logo-front)
- Instagram Reels: **Meta 3-3-3** baseline with ABCDs QA
- YouTube Shorts: **ABCDs** primary structure with PAS/BAB content
- LinkedIn video: more conservative — AIDA or SB7 register

---

## Implementation notes — how this becomes the `format_templates` engine

### Data model implication

Each framework becomes a row (or set of rows) in a `format_templates` table:

```typescript
interface FormatTemplate {
  id: string;
  name: string;                     // "pas", "bab", "meta_333", "tiktok_hbc"
  display_name: string;             // "Problem / Agitate / Solution"
  slot_count: number;
  duration_min_seconds: number;
  duration_max_seconds: number;
  subscriber_category_fit: string[]; // gbp categories where this template is appropriate
  platform_fit: string[];            // ["reels", "tiktok", "shorts"] etc.
  hook_treatment: HookSpec;
  body_treatment: BodySpec;
  close_treatment: CloseSpec;
  shot_slots: ShotSlot[];           // ordered list with role + duration + asset requirements
  brand_integration_rule: string;   // "throughout" | "early" | "late"
  cta_treatment: CTASpec;
  source_framework: string;         // citation back to this catalog
}

interface ShotSlot {
  slot_index: number;
  role: 'hook' | 'before' | 'after' | 'bridge' | 'problem' | 'agitate' | 'solution' | 'cta' | ...;
  duration_seconds: number;
  asset_requirements: AssetRequirements;  // composition, content type, mood
  camera_movement_type: string;            // from kling-camera-vocabulary
  text_overlay?: TextOverlaySpec;
}
```

### Vision extension implication

Per the multi-shot architecture intent, Vision needs to score each subscriber asset against shot roles. The roles to score:

- `hook_fitness` — does this asset work as an opener? (motion, tight framing, brand visibility)
- `before_state_fitness` — visual signals of before-state (clutter, damage, dated finishes)
- `after_state_fitness` — visual signals of after-state (clean, finished, well-composed)
- `process_fitness` — work-in-progress signals (worker present, tools, action)
- `detail_fitness` — close-up composition with focal subject
- `hero_fitness` — composition quality + finished-state + framing
- `cta_fitness` — clean composition with room for text overlay (per [[social-media-safe-zones]])

These per-role scores let the orchestrator match assets to shot slots in any template.

### Orchestrator logic

For each post the autopilot fires:

1. **Subscriber categorization** → derive Brand DNA + service category
2. **Template selection** → pick from frameworks appropriate for category + platform target
3. **Asset role matching** → score available assets against template's shot slots; pick best matches
4. **Gap filling** → if a shot slot has no good asset match, either:
   - AI-generate the missing shot via `image_style` + scene description (per the relaxed authenticity policy)
   - Crop-derive from another asset (macro→micro trick per Luma)
   - Skip the slot (degrade gracefully) if framework allows
5. **Brief assembly** → produce the canonical brief schema (per multi-shot architecture intent)
6. **Brief-driven QA** → validate brief against framework principles + ABCDs
7. **Render** → per-shot Kling + stitch
8. **Final QA** → vision check; safe-zone compliance; ABCDs principles
9. **Publish**

### A/B testing surface

The catalog gives us natural variation axes for performance testing:

- Same content, different framework (PAS vs BAB for the same project)
- Same framework, different hook variations (TikTok-style 3-5 hook variants)
- Same template, different asset selections (which assets win in which slots)
- Same render, different captions (caption variant per framework type)

Engagement-polling pipeline (`#116`) provides the measurement signal. Strategy "recently used" tracking (`#135`) ensures variety.

---

## What's NOT in this catalog (and why)

- **Long-form narrative frameworks** (3-act structure, Hero's Journey, Pixar's "Once upon a time...") — These work but compress poorly into 15-30s social formats. Worth a separate sub-catalog for 60-90s premium content.
- **Direct-response sales-letter frameworks** (PASTOR, AICPBSAWN, etc.) — More verbose; built for sales pages, not short-form video.
- **Brand purpose frameworks** (Sinek's Golden Circle "Why-How-What") — Better for brand strategy than ad-craft per se; informs Brand DNA but not template structure.
- **Email/landing-page-specific frameworks** (4 P's, 5 Basic Objections, FAB) — Cross-applicable in principle but optimized for different mediums.

These aren't excluded forever — they're deferred until the foundational 7 are codified and we have engagement data to know what's working.

---

## Next steps (operational)

1. **Codify the catalog into `format_templates` table seed data** — translate each framework into the data model above
2. **Extend Vision** to score asset role-fitness against the slot taxonomy (cuts across all templates)
3. **Build template-picking orchestrator logic** — Brand DNA + category + platform → template selection
4. **Implement brief-driven QA** with framework-specific validators (PAS validator checks problem/agitate/solution slots are filled; ABCDs validator is universal)
5. **Surface in operator UI** for transparency + manual override during early autopilot rollout
6. **Wire engagement signal back** to template performance tracking — which frameworks work for which subscribers

---

## Catalog maintenance

This catalog should be revisited:

- **Quarterly** — platform best-practice playbooks (Meta, TikTok, YouTube) evolve; check for updates
- **On engagement signal accumulation** — when we have enough TracPost-published data, identify which frameworks/templates outperform per subscriber category and update the catalog with empirical findings
- **On platform launches** — new platforms (e.g., Threads ads) need their own framework variants
- **When a new authoritative framework emerges** — rare but happens (e.g., StoryBrand was new in 2017)

---

## Sources

**Modern platform-specific best practices:**
- [Google Ads Help — ABCDs of Effective Video Ads](https://support.google.com/google-ads/answer/14783551)
- [Think with Google — YouTube Video Ad Creative](https://www.thinkwithgoogle.com/future-of-marketing/creativity/youtube-video-ad-creative/)
- [Google Business — A Guide to Creating Effective Video Ads](https://business.google.com/us/resources/articles/abcds-of-effective-video-ads/)
- [TikTok Ads Help — Creative Best Practices](https://ads.tiktok.com/help/article/creative-best-practices)
- [TikTok For Business — Creative Best Practices Top-Performing Ads](https://ads.tiktok.com/business/en-US/blog/creative-best-practices-top-performing-ads)
- [TikTok Creative Codes — 6 Principles](https://ads.tiktok.com/business/en/creative-codes)
- [Meta Ads Best Practices 2026 — LeadsBridge](https://leadsbridge.com/blog/meta-ads-best-practices/)
- [Meta Ads Creative Strategies 2026 — Flighted](https://www.flighted.co/blog/7-meta-ads-creative-strategies-that-work)
- [Stackmatix TikTok Ad Creative Best Practices 2026](https://www.stackmatix.com/blog/tiktok-ad-creative-best-practices-2026)
- [Sovran TikTok Creative Best Practices 2026](https://sovran.ai/blog/tiktok-creative-best-practices)

**Classic frameworks:**
- [Wikipedia — AIDA (marketing)](https://en.wikipedia.org/wiki/AIDA_(marketing))
- [Siege Media — AIDA Model](https://www.siegemedia.com/creation/aida-model)
- [Copy Hackers — Attention Interest Desire Action](https://copyhackers.com/2023/03/attention-interest-desire-action/)
- [Smart Insights — AIDA Model](https://www.smartinsights.com/traffic-building-strategy/offer-and-message-development/aida-model/)
- [SaaS Funnel Lab — PAS Framework 2025](https://www.saasfunnellab.com/essay/pas-copywriting-framework/)
- [Omniscient Digital — PAS Copywriting](https://beomniscient.com/blog/pas-copywriting/)
- [Crazy Egg — PAS Framework](https://www.crazyegg.com/blog/pas-framework/)
- [Pageblock — PAS Framework](https://pageblock.io/resources/framework/pas)
- [Pageblock — BAB Framework](https://pageblock.io/resources/framework/bab)
- [StoryPrompt — Before After Bridge](https://www.storyprompt.com/blog/before-after-bridge)
- [Campaign Monitor — BAB Copywriting](https://www.campaignmonitor.com/email/bab-copywriting/)
- [BlackSheep Creative — Before-After-Bridge Framework](https://blaksheepcreative.com/digital-marketing/content-marketing/copywriting/before-after-bridge/)

**StoryBrand:**
- [Creativeo — StoryBrand Framework Guide](https://www.creativeo.co/post/storybrand-framework)
- [Well Dressed Walrus — 7 Parts of StoryBrand](https://welldressedwalrus.com/7-parts-of-a-storybrand-framework/)
- [IMPACT — What is StoryBrand](https://www.impactplus.com/learn/what-is-the-storybrand-framework)
- [Gravity Global — Complete Guide StoryBrand Framework](https://www.gravityglobal.com/blog/complete-guide-storybrand-framework)
- Donald Miller, *Building a StoryBrand* (2017) — primary source

**Books referenced (not directly cited but foundational):**
- Luke Sullivan, *Hey Whipple, Squeeze This* (modern ad craft fundamentals)
- David Ogilvy, *Ogilvy on Advertising* (direct response and brand advertising)
- John Truby, *The Anatomy of Story* (story structure)
- Blake Snyder, *Save the Cat* (screenwriting structure)

---

*Document version: Draft 1 — built 2026-05-25. Ready for review, codification into `format_templates` seed data, and Vision asset-role-fitness extension work.*
