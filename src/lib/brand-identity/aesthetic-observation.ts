/**
 * Aesthetic Phase 2 — the OBSERVATION call.
 *
 * Per [[brand-identity-research-architecture]] (LOCKED 2026-06-03): a research-grade
 * Sonnet 4.6 multimodal call observes the brand factually from public sources and
 * produces canonical observation substrate. NO creative inference. NO recommendations.
 * Downstream production calls (env_look / subject_style candidate generators,
 * eventual Phase 3 owner review) consume this substrate.
 *
 * v1 storage: business_substrate (kind=public_presence_observation). brand_descriptor
 * [aesthetic].extracted holds a thin pointer so the existing status machine still
 * tracks "was observation run, when, with what model" — the rich payload lives
 * in substrate. Per the locked separate-stores principle of [[substrate-libraries-layer]].
 */
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { sql } from "@/lib/db";
import { upsertSubstrate } from "@/lib/substrate/store";
import type { DescriptorExtractor, ExtractionResult } from "./extract";

const anthropic = new Anthropic();

const MODEL = "claude-sonnet-4-6";
// v2 prompt content; renamed to match the public_presence_observation substrate
// kind. Bump to v3 only when the prompt content materially changes.
const PROMPT_VERSION = "public_presence_observation_v2";

// ── The observation payload schema ──────────────────────────────────────────
// Type contract lives in aesthetic-observation-types.ts (client-safe, no
// "server-only" marker) so UI consumers can import without dragging the
// server-only marker into client bundles. Schema rationale: descriptor-keyed,
// top-level domains mirror src/lib/brand-identity/catalog.ts. Per
// [[brand-identity-closed-loop]] LOAD-BEARING 2026-06-04.
export type {
  BrandClassVerdict,
  BrandIdentityObservationPayload,
  DescriptorObservation,
} from "./aesthetic-observation-types";
import type { BrandIdentityObservationPayload } from "./aesthetic-observation-types";

// ── Source assembly ─────────────────────────────────────────────────────────

interface BusinessRow {
  id: string;
  name: string | null;
  url: string | null;
}

interface ObservationImage {
  url: string;
  /** Tag passed in the text payload so the model knows what each image is. */
  label: string;
}

interface AssembledObservationSources {
  business: BusinessRow;
  websiteUrl: string | null;
  /** Ordered, deduped image array fed to the multimodal call. */
  images: ObservationImage[];
  gbpCategories: { name: string; isPrimary: boolean }[];
  /** Structured GBP profile content surfaced as text in the prompt. Null when
   *  the business has no GBP connected or the profile is empty. Lets the LLM
   *  observe cross-surface consistency (description-vs-homepage framing, NAP,
   *  hours, service areas, etc.) without needing additional image captures. */
  gbpProfile: GbpProfileSummary | null;
}

interface GbpProfileSummary {
  description: string | null;
  phoneNumber: string | null;
  websiteUri: string | null;
  addressLines: string[];
  locality: string | null;
  administrativeArea: string | null;
  regularHours: Array<{ day: string; openTime?: string; closeTime?: string }>;
  serviceAreaPlaces: string[];
  reviewCount: number | null;
  averageRating: number | null;
  openingDate: string | null;
}

/** PPA's screenshot freshness window. Beyond this, JIT-recapture before
 *  observing so PPA #1 vs PPA #2 diffs reflect actual site changes, not
 *  capture staleness. Aligned with the recurring-quality-gate doctrine. */
const SCREENSHOT_FRESHNESS_MS = 30 * 24 * 60 * 60 * 1000;

async function assembleObservationSources(
  businessId: string,
): Promise<AssembledObservationSources> {
  const [biz] = await sql`
    SELECT id, name, url,
           business_website_screenshot, business_website_screenshot_at,
           gbp_photos_grid, gbp_photos_grid_at,
           business_logo, business_favicon,
           gbp_profile
    FROM businesses
    WHERE id = ${businessId}
    LIMIT 1
  `;
  if (!biz) throw new Error(`aesthetic-observation: business ${businessId} not found`);

  const business: BusinessRow = {
    id: biz.id as string,
    name: biz.name as string | null,
    url: biz.url as string | null,
  };
  const websiteUrl = business.url
    ? business.url.startsWith("http") ? business.url : `https://${business.url}`
    : null;

  // JIT screenshot capture — if the stored screenshot is missing or older
  // than the freshness window, capture-then-observe so PPA always reads
  // the current site. Graceful degrade: on capture failure, proceed with
  // whatever images we already have; if none, the downstream throw at
  // image-assembly time reports the actual gap.
  // Dynamic import keeps puppeteer-core + @sparticuz/chromium out of the
  // import graph for any route that doesn't trigger PPA observation.
  let screenshotUrl = biz.business_website_screenshot as string | null;
  const screenshotAt = biz.business_website_screenshot_at as Date | string | null;
  const isStale =
    !screenshotAt ||
    Date.now() - new Date(screenshotAt as string | Date).getTime() > SCREENSHOT_FRESHNESS_MS;
  if (websiteUrl && isStale) {
    try {
      const { captureBusinessWebsiteScreenshot } = await import("@/lib/capture/website-screenshot");
      const captured = await captureBusinessWebsiteScreenshot(businessId);
      screenshotUrl = captured.url;
      console.log(
        `[ppa] JIT-captured screenshot for ${businessId} in ${captured.durationMs}ms ` +
          `(${Math.round(captured.bytesSize / 1024)}KB)`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[ppa] JIT capture failed for ${businessId}; proceeding with prior images: ${msg}`,
      );
    }
  }

  // JIT GBP photos grid composite — single composite image containing up to
  // 10 photos from gbp_photo_sync (owner-published, synced from Google's GBP
  // Media API; genuinely public). Replaces the previous loop of N individual
  // base64 photo images: one composite is a smaller payload + lets the LLM
  // observe cross-photo patterns (variety, coherence, repeated subjects).
  //
  // Excludes gbp_cover_asset_id / gbp_logo_asset_id deliberately — those are
  // TracPost-side nominations awaiting a push, not public artifacts. Agency-
  // scope doctrine requires PPA to observe only what's live on Google.
  let photosGridUrl = biz.gbp_photos_grid as string | null;
  const gridAt = biz.gbp_photos_grid_at as Date | string | null;
  const gridStale =
    !gridAt || Date.now() - new Date(gridAt as string | Date).getTime() > SCREENSHOT_FRESHNESS_MS;
  if (gridStale) {
    try {
      const { captureGbpPhotosGrid } = await import("@/lib/capture/gbp-photos-grid");
      const captured = await captureGbpPhotosGrid(businessId);
      if (captured) {
        photosGridUrl = captured.url;
        console.log(
          `[ppa] JIT-built GBP photos grid for ${businessId} in ${captured.durationMs}ms ` +
            `(${Math.round(captured.bytesSize / 1024)}KB, ${captured.photoCount} photos: ` +
            `${captured.categoriesIncluded.join(", ")})`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(
        `[ppa] GBP photos grid build failed for ${businessId}; proceeding without: ${msg}`,
      );
    }
  }

  // Read GBP cover + GBP logo separately from gbp_photo_sync. These two
  // photos have load-bearing observation roles distinct from the "rest of
  // the portfolio" grid:
  //   - Cover photo: the brand's most intentional GBP visual choice → enables
  //     cross-surface comparison vs website hero ("is this the same project?")
  //   - GBP logo: may DIFFER from business_logo (Google sometimes serves an
  //     older crop, owner uploaded a square variant for the Maps tile, etc.)
  //     → enables consistency check vs the website's brand logo
  // For the logo slot: Google's GBP Media API tags two related categories —
  // LOGO (explicit) and PROFILE (the circular avatar that appears in Maps
  // results, which most brands use AS their logo equivalent). LOGO is rare;
  // PROFILE is what most accounts actually have. Prefer LOGO when present,
  // fall back to PROFILE — both serve the same cross-surface comparison role.
  const gbpSpecialRows = await sql`
    SELECT gbp_media_url, category
    FROM gbp_photo_sync
    WHERE business_id = ${businessId}
      AND gbp_media_url IS NOT NULL
      AND category IN ('COVER', 'LOGO', 'PROFILE')
    ORDER BY synced_at DESC NULLS LAST
  `;
  const gbpCoverUrl =
    (gbpSpecialRows.find((r) => r.category === "COVER")?.gbp_media_url as string | undefined) ?? null;
  const gbpLogoUrl =
    ((gbpSpecialRows.find((r) => r.category === "LOGO") ??
      gbpSpecialRows.find((r) => r.category === "PROFILE"))?.gbp_media_url as string | undefined) ?? null;

  // Build image array. Priority order: website screenshot (most signal),
  // brand logo (website-side), then the special GBP slots (cover + GBP logo),
  // then the composite grid for everything else.
  const images: ObservationImage[] = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined, label: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, label });
  };
  push(screenshotUrl, "website homepage screenshot");
  push(biz.business_logo as string | null, "brand logo (website)");
  push(gbpCoverUrl, "GBP cover photo (live on Google)");
  push(gbpLogoUrl, "GBP logo (live on Google) — may differ from website brand logo");
  push(photosGridUrl, "GBP photos composite grid — pulled from Google");

  const catRows = await sql`
    SELECT gc.name, sgc.is_primary
    FROM business_gbp_categories sgc
    JOIN gbp_categories gc ON gc.gcid = sgc.gcid
    WHERE sgc.business_id = ${businessId}
    ORDER BY sgc.is_primary DESC, gc.name ASC
  `;
  const gbpCategories = catRows.map((r) => ({
    name: r.name as string,
    isPrimary: Boolean(r.is_primary),
  }));

  const gbpProfile = summarizeGbpProfile(
    biz.gbp_profile as Record<string, unknown> | null | undefined,
  );

  return { business, websiteUrl, images, gbpCategories, gbpProfile };
}

/** Reduce the raw GBP JSONB to the fields PPA cares about. Returns null when
 *  the profile is missing or has zero meaningful content. */
function summarizeGbpProfile(
  raw: Record<string, unknown> | null | undefined,
): GbpProfileSummary | null {
  if (!raw || Object.keys(raw).length === 0) return null;

  const nonEmptyStr = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

  const addr = (raw.address as Record<string, unknown> | undefined) ?? {};
  const addressLines = ((addr.addressLines as string[] | undefined) ?? []).filter(
    (l) => typeof l === "string" && l.trim().length > 0,
  );

  const hours = ((raw.regularHours as Array<Record<string, unknown>> | undefined) ?? [])
    .map((h) => ({
      day: String(h.day ?? h.dayOfWeek ?? "").toLowerCase(),
      openTime: nonEmptyStr(h.openTime) ?? undefined,
      closeTime: nonEmptyStr(h.closeTime) ?? undefined,
    }))
    .filter((h) => h.day);

  const places = (((raw.serviceArea as Record<string, unknown> | undefined)?.places as Record<string, unknown> | undefined)
    ?.placeInfos as Array<Record<string, unknown>> | undefined) ?? [];
  const serviceAreaPlaces = places
    .map((p) => nonEmptyStr(p.placeName))
    .filter((p): p is string => p !== null);

  const reviewCount =
    typeof raw.reviewCount === "number"
      ? raw.reviewCount
      : typeof raw.userRatingCount === "number"
        ? raw.userRatingCount
        : null;
  const averageRating =
    typeof raw.averageRating === "number"
      ? raw.averageRating
      : typeof raw.rating === "number"
        ? raw.rating
        : null;

  const summary: GbpProfileSummary = {
    description: nonEmptyStr(raw.description),
    phoneNumber: nonEmptyStr(raw.phoneNumber),
    websiteUri: nonEmptyStr(raw.websiteUri),
    addressLines,
    locality: nonEmptyStr(addr.locality),
    administrativeArea: nonEmptyStr(addr.administrativeArea),
    regularHours: hours,
    serviceAreaPlaces,
    reviewCount,
    averageRating,
    openingDate: nonEmptyStr(raw.openingDate),
  };

  // If literally nothing meaningful is set, treat as no profile.
  const hasAny =
    summary.description ||
    summary.phoneNumber ||
    summary.addressLines.length > 0 ||
    summary.regularHours.length > 0 ||
    summary.serviceAreaPlaces.length > 0 ||
    summary.reviewCount !== null ||
    summary.averageRating !== null;
  return hasAny ? summary : null;
}

// ── The observation prompt ──────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a senior brand analyst on the first day of an engagement, studying a business from publicly available sources. Your single job is OBSERVATION — capture what is factually evident, exhaustively and without inference.

DISCIPLINE:
- Observe ONLY what is directly evidenced by the sources provided.
- Do NOT recommend, suggest, refine, or propose creative direction.
- Do NOT invent details to fill gaps — name gaps explicitly in gaps_and_absences.
- Do NOT generalize from category priors; report what THIS brand shows, not what brands like this typically show.
- Stay factual: "the website uses warm amber tones and large serif headings" rather than "the brand feels heritage-luxe".

TRACPOST AGENCY SCOPE — observe for METRICS, not aesthetic judgment:
The agency's value-add is in measurable brand-identity signals (cross-surface consistency, catalog feeding, content-generation inputs). It is NOT in subjective visual-design judgment. Visual asset choices (logo design, color palette curation, typography selection) are owner authority; the LLM is not in a position to opine on their design quality.

OBSERVE for these purposes:
- Cross-surface CONSISTENCY signals (does the declared palette appear in actual UI? does NAP match across surfaces? does the homepage framing match GBP categories?)
- CATALOG-feeding observation (what tone, voice, palette, lexicon, positioning does this brand use? — these feed brand_descriptor declarations)
- Content-generation INPUTS (what voice should new posts match? what palette should website pages use?)

DO NOT OBSERVE for these purposes:
- Aesthetic judgment of design assets standing alone ("logo looks distinctive in your category," "color choice is unusual," "square format is striking")
- Distinctiveness-for-its-own-sake findings that don't feed a downstream pipeline
- Recommendations about creative direction or visual redesign

A useful test for any observation: does it feed a downstream pipeline (palette → CSS vars, tone → copy gen) or measure a cross-surface metric (NAP, palette consistency, GBP-vs-homepage alignment)? If neither — skip it.

When observing visual assets (logo, favicon, photography): emit FACTUAL attributes (color, format, scale, mark style) into visual.* descriptors for downstream consistency use. Do NOT emit standalone aesthetic-judgment findings about whether those choices are good, distinctive, or category-appropriate.

PAYLOAD STRUCTURE: The payload is descriptor-keyed under domain — each slot (e.g. verbal.tone, visual.palette) is one brand-identity descriptor. For each descriptor:
- If the sources show enough to observe it: emit { "observed": <descriptor-specific value>, "evidence": [<direct quotes or specific visual elements that support each observation>] }
- If the sources don't carry that signal (e.g. sonic descriptors from a website): set the slot to null. DO NOT fabricate. visual.do_not_show is ALWAYS null (guardrails are not observable from public sources by definition).
- evidence MUST be specific, quoted, or pointable — "the footer tagline 'We do the projects other contractors turn down'" not "the copy is confident". Every observed claim needs at least one evidence item.

For meta.verdict, choose one brand class:
- type_a: well-established, market-recognized, visually distinctive, internally consistent
- type_b: existing identity but inconsistent across surfaces OR generic-looking
- type_c: existing identity strongly mismatched with what they appear to offer
- type_d: insufficient public presence to observe a coherent identity

meta.confidence is your self-assessed confidence in the verdict, 0.0 to 1.0.

distinctive_elements_vs_category_defaults captures observations of category-divergence ONLY when the divergence has a downstream metric or content-generation use (e.g., a tone divergence that should anchor future copy gen; a positioning divergence that informs CMA classification). Pure aesthetic distinctiveness without downstream use does NOT belong here.

gaps_and_absences names what couldn't be observed from these sources OR signals that are missing from the brand's public presence that have a downstream consequence (a missing tone signal blocks copy-gen; a missing palette blocks website-gen). Pure observational gaps without consequence ("no video content was visible") may be noted but lower the bar for inclusion — prefer omitting over speculating.

OUTPUT: a single valid JSON object matching the requested schema exactly. No prose, no markdown fences, no commentary outside the JSON.`;
}

function buildUserText(sources: AssembledObservationSources): string {
  const lines: string[] = [];
  lines.push("OBSERVATION TARGET");
  lines.push(`- Business name: ${sources.business.name ?? "(unknown)"}`);
  if (sources.websiteUrl) lines.push(`- Website: ${sources.websiteUrl}`);
  if (sources.gbpCategories.length) {
    lines.push("- GBP categories:");
    for (const c of sources.gbpCategories) {
      lines.push(`    · ${c.name}${c.isPrimary ? " (primary)" : ""}`);
    }
  }
  lines.push("");

  // GBP PROFILE TEXT — the owner-published fields visible on Google Maps.
  // Relayed via our DB so the LLM has cross-surface observability (description
  // vs homepage framing, NAP consistency, hours, service area scope) without
  // requiring a separate GBP screenshot capture.
  if (sources.gbpProfile) {
    const p = sources.gbpProfile;
    lines.push("GBP PROFILE (owner-published, publicly visible on Google Maps)");
    if (p.description) lines.push(`- Description: ${p.description}`);
    if (p.phoneNumber) lines.push(`- Phone: ${p.phoneNumber}`);
    if (p.websiteUri) lines.push(`- Website (per GBP): ${p.websiteUri}`);
    if (p.addressLines.length || p.locality || p.administrativeArea) {
      const addressParts = [
        p.addressLines.join(", "),
        p.locality,
        p.administrativeArea,
      ].filter((v) => v && v.length > 0);
      lines.push(`- Address: ${addressParts.join(", ")}`);
    }
    if (p.regularHours.length) {
      lines.push("- Hours:");
      for (const h of p.regularHours) {
        const time = h.openTime && h.closeTime ? `${h.openTime}–${h.closeTime}` : "closed";
        lines.push(`    · ${h.day}: ${time}`);
      }
    }
    if (p.serviceAreaPlaces.length) {
      lines.push(`- Service areas: ${p.serviceAreaPlaces.join(", ")}`);
    }
    if (p.reviewCount !== null || p.averageRating !== null) {
      const ratingText = p.averageRating !== null ? `${p.averageRating.toFixed(1)} avg` : "no avg";
      const countText = p.reviewCount !== null ? `${p.reviewCount} reviews` : "no count";
      lines.push(`- Reviews: ${countText} (${ratingText})`);
    }
    if (p.openingDate) lines.push(`- Opening date: ${p.openingDate}`);
    lines.push("");
  }

  lines.push("IMAGES PROVIDED IN THIS CALL (in order)");
  sources.images.forEach((img, i) => lines.push(`  ${i + 1}. ${img.label}`));
  lines.push("");
  lines.push("REQUIRED OUTPUT SCHEMA (descriptor-keyed — emit every slot; use null when not observable from these sources)");
  lines.push(`{
  "meta": {
    "research_sources_consulted": ["..."],
    "verdict": "type_a|type_b|type_c|type_d",
    "confidence": 0.0,
    "visual_consistency_score": "X/10 — reason",
    "distinctiveness_score": "X/10 — reason",
    "alignment_with_positioning_score": "X/10 — reason"
  },

  "verbal": {
    "tone":             { "observed": ["adjective", "..."], "evidence": ["direct quote", "..."] } | null,
    "lexicon":          { "observed": { "use": ["term that recurs", "..."], "avoid": ["term notably absent or rejected", "..."] }, "evidence": ["..."] } | null,
    "avoid":            { "observed": ["pattern the brand visibly refuses", "..."], "evidence": ["..."] } | null,
    "voice_source":     { "observed": "who speaks for the brand: founder | team | named individuals | brand persona | operator role", "evidence": ["..."] } | null,
    "mechanical_style": { "observed": ["sentence-length pattern", "casing pattern", "emoji policy", "..."], "evidence": ["..."] } | null,
    "tagline":          { "observed": "the actual tagline text if visible", "evidence": ["..."] } | null
  },

  "strategic": {
    "offer":       { "observed": { "services": ["..."], "capabilities": ["..."] }, "evidence": ["..."] } | null,
    "positioning": { "observed": { "wedge": "1-sentence stance", "angles": ["distinct angle", "..."], "narrative": "what story the brand tells about itself" }, "evidence": ["..."] } | null,
    "audience":    { "observed": ["who the copy addresses", "..."], "evidence": ["..."] } | null,
    "proof":       { "observed": ["projects shown", "certs visible", "testimonials present", "measurable results", "..."], "evidence": ["..."] } | null,
    "hooks":       { "observed": ["opening angle / story pattern used", "..."], "evidence": ["..."] } | null,
    "cta":         { "observed": { "action": "what the brand asks for", "style": "warm | urgent | qualifier-filtered | ..." }, "evidence": ["..."] } | null
  },

  "visual": {
    "aesthetic":          { "observed": { "typography": ["family or character description", "..."], "layout": ["pattern", "..."], "overall": "1-sentence overall look/feel" }, "evidence": ["..."] } | null,
    "environmental_look": { "observed": { "lighting": "warm | cool | natural | dramatic | ...", "materials": ["material/texture token", "..."], "mood": "lived-in | just-finished | mid-process | ..." }, "evidence": ["..."] } | null,
    "subject_style":      { "observed": { "photographic_treatment": "professional | candid | documentary | ...", "subjects_shown": ["who/what appears", "..."], "framing": "posed | mid-action | environmental | ..." }, "evidence": ["..."] } | null,
    "palette":            { "observed": { "colors": ["hex or named color", "..."], "usage": "how the colors are distributed across UI vs logo vs accents" }, "evidence": ["..."] } | null,
    "logo":               { "observed": { "mark": "description of the logo mark", "usage": "where it appears + consistency" }, "evidence": ["..."] } | null,
    "do_not_show":        null
  },

  "sonic": {
    "voiceover_character": null,
    "music_mood":          null,
    "sfx_style":           null,
    "pronunciation":       null
  },

  "distinctive_elements_vs_category_defaults": ["..."],
  "gaps_and_absences": ["..."]
}`);
  return lines.join("\n");
}

// ── The Sonnet 4.6 multimodal call ──────────────────────────────────────────

interface ObservationCallResult {
  payload: BrandIdentityObservationPayload;
  imagesSent: string[];
  rawText: string;
}

type AnthropicMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function normalizeMediaType(ct: string | null): AnthropicMediaType {
  const base = (ct ?? "").split(";")[0].trim().toLowerCase();
  if (base === "image/jpeg" || base === "image/jpg") return "image/jpeg";
  if (base === "image/png") return "image/png";
  if (base === "image/gif") return "image/gif";
  if (base === "image/webp") return "image/webp";
  // Default to JPEG — Anthropic's only accepted types are the four above.
  // If the source served something else, the API will reject; treat unknown
  // as a hard failure rather than guessing.
  throw new Error(`aesthetic-observation: unsupported image media type '${ct ?? "(none)"}'`);
}

async function fetchAsInlineImage(
  url: string,
): Promise<{ media_type: AnthropicMediaType; data: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`aesthetic-observation: image fetch ${res.status} for ${url}`);
  }
  const media_type = normalizeMediaType(res.headers.get("content-type"));
  const bytes = Buffer.from(await res.arrayBuffer());
  return { media_type, data: bytes.toString("base64") };
}

async function callObservationModel(
  sources: AssembledObservationSources,
): Promise<ObservationCallResult> {
  if (sources.images.length === 0) {
    throw new Error(
      "aesthetic-observation: no observable images — no website screenshot, brand logo, GBP cover, or priority-category GBP photos available for this brand",
    );
  }

  // Inline base64 — Anthropic's URL-fetch path was being WAF-blocked by our
  // CDN (assets.tracpost.com). We fetch from R2 ourselves and pass inline.
  // Tradeoff: ~33% payload bloat from base64; acceptable for a once-per-brand
  // call. Switch back to URL sources if/when CDN whitelist is in place.
  const inlineImages = await Promise.all(
    sources.images.map((img) => fetchAsInlineImage(img.url)),
  );

  const content: Anthropic.Messages.ContentBlockParam[] = [
    ...inlineImages.map(
      (img): Anthropic.Messages.ContentBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: img.media_type, data: img.data },
      }),
    ),
    { type: "text", text: buildUserText(sources) },
  ];

  const response = await anthropic.messages.create({
    model: MODEL,
    // Descriptor-keyed v2 schema has ~25 evidence-bearing slots; output runs
    // 5-7K tokens once populated. 4096 truncated mid-JSON on first v2 run.
    max_tokens: 8192,
    system: buildSystemPrompt(),
    messages: [{ role: "user", content }],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "";
  const cleaned = text.replace(/```json?\s*/g, "").replace(/```/g, "").trim();

  let payload: BrandIdentityObservationPayload;
  try {
    payload = JSON.parse(cleaned) as BrandIdentityObservationPayload;
  } catch {
    throw new Error(
      `aesthetic-observation: model returned non-JSON output (model=${MODEL}); raw text length=${text.length}`,
    );
  }

  return { payload, imagesSent: sources.images.map((i) => i.url), rawText: text };
}

// ── The DescriptorExtractor (plugged into the harness for aesthetic) ────────

/**
 * Run the Phase 2 observation for a brand identity, persist the rich payload to
 * business_substrate, and return a thin pointer envelope for the existing
 * brand_descriptor.extracted status machine.
 *
 * `businessId` is extra context the corpus-mining extractors need beyond what
 * AssembledInput carries. The harness resolves it before calling.
 */
export const aestheticObservationExtractor: DescriptorExtractor = async ({
  spec,
  businessId,
}) => {
  if (spec.key !== "aesthetic") {
    throw new Error(
      `aesthetic-observation: wired against descriptor key '${spec.key}'; expected 'aesthetic'`,
    );
  }
  if (!businessId) {
    throw new Error("aesthetic-observation: businessId required in extractor ctx");
  }

  const sources = await assembleObservationSources(businessId);
  const callResult = await callObservationModel(sources);
  const { payload, imagesSent } = callResult;
  const confidence = payload.meta?.confidence ?? null;
  const verdict = payload.meta?.verdict ?? null;

  const generatedAt = new Date().toISOString();
  const { id: substrateId } = await upsertSubstrate({
    businessId,
    kind: "public_presence_observation",
    payload: payload as unknown as Record<string, unknown>,
    generationMetadata: {
      model: MODEL,
      prompt_version: PROMPT_VERSION,
      generated_at: generatedAt,
      confidence,
      inputs: {
        website_url: sources.websiteUrl,
        image_count: sources.images.length,
        image_labels: sources.images.map((i) => i.label),
        gbp_category_names: sources.gbpCategories.map((c) => c.name),
      },
    },
  });

  // Thin pointer in brand_descriptor.extracted — the status machine reads this.
  // Rich payload lives in business_substrate (separate-stores lock).
  const result: ExtractionResult = {
    envelope: {
      summary: verdict
        ? `Observation written (${verdict}). See business_substrate row ${substrateId}.`
        : `Observation written. See business_substrate row ${substrateId}.`,
      value: {
        substrate_kind: "public_presence_observation",
        substrate_id: substrateId,
        verdict,
      },
    },
    model: MODEL,
    confidence,
    inputsSnapshot: {
      prompt_version: PROMPT_VERSION,
      business_id: businessId,
      images_sent: imagesSent,
      gbp_categories: sources.gbpCategories.map((c) => c.name),
      generated_at: generatedAt,
    },
  };
  return result;
};
