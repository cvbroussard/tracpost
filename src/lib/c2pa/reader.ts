/**
 * C2PA Content Credentials reader.
 *
 * C2PA is the Coalition for Content Provenance and Authenticity standard
 * for embedding tamper-resistant provenance manifests in media files.
 * Major AI generators (Adobe Firefly, OpenAI, Google Imagen, Microsoft)
 * embed C2PA manifests declaring AI source. Reading these manifests at
 * upload lets us auto-flag AI-generated content with high confidence
 * (~99% accuracy when manifest is present and intact).
 *
 * Per project_tracpost_upload_ai_detection.md, this is Phase 2 of #161:
 * Phase 1 ships the explicit subscriber toggle; this reader auto-overrides
 * the toggle to TRUE when a manifest declares AI provenance.
 *
 * Coverage characteristics:
 * - Intact manifest: ~99% accurate
 * - Stripped manifest (screenshots, re-encodes): undetectable — falls back to
 *   subscriber declaration
 * - Tampered manifest: caught (signature verification fails)
 *
 * Implementation note (2026-05-08):
 * The wiring lands first; the actual C2PA library integration is a small
 * follow-up swap. Adobe's `c2pa-node` package provides Node.js bindings;
 * verify current version + install before swapping the stub.
 *
 * To complete the swap:
 *   1. npm install c2pa-node (or the current Adobe binding)
 *   2. Replace `readManifestStub` with real `Reader.fromBuffer(...)` call
 *   3. Verify on a sample Firefly/DALL-E export
 */

export interface C2paResult {
  /** Whether the manifest declares AI generation (Adobe Firefly, OpenAI, etc.) */
  isAiGenerated: boolean;
  /** The claim_generator string from the manifest (e.g., "Adobe Firefly") */
  claimGenerator: string | null;
  /** Manifest title if present */
  title: string | null;
  /** Full manifest store JSON for audit trail */
  raw: Record<string, unknown> | null;
}

/**
 * Read C2PA manifest from a media URL. Returns null when:
 * - File has no manifest
 * - Manifest is malformed or signature invalid
 * - C2PA library not yet installed (current state — see implementation note)
 *
 * Designed to fail soft: any error returns null, never throws. Upload flow
 * proceeds normally regardless of manifest detection outcome.
 */
export async function readC2paManifest(
  url: string,
  mimeType: string,
): Promise<C2paResult | null> {
  // C2PA only applies to images and video
  if (!mimeType.startsWith("image/") && !mimeType.startsWith("video/")) {
    return null;
  }

  try {
    // Fetch the file
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());

    // STUB — replace with real c2pa-node integration
    return await readManifestStub(buffer, mimeType);
  } catch (err) {
    console.warn("C2PA read failed (non-fatal):", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Stub implementation. Returns null until c2pa-node is wired in.
 *
 * Replace with:
 * ```ts
 * import { Reader } from 'c2pa-node';
 * const reader = await Reader.fromBuffer(mimeType, buffer);
 * const store = reader.getManifestStore();
 * if (!store?.activeManifest) return null;
 * const manifest = store.activeManifest;
 * return {
 *   isAiGenerated: detectAiSignals(manifest),
 *   claimGenerator: manifest.claimGenerator,
 *   title: manifest.title || null,
 *   raw: store as Record<string, unknown>,
 * };
 * ```
 *
 * Where `detectAiSignals` checks:
 * - manifest.claimGenerator includes "firefly" / "openai" / "imagen" / "midjourney"
 * - manifest.assertions includes c2pa.actions with action == "c2pa.created" by AI tools
 * - manifest.signatureInfo.issuer is a known AI generator
 */
async function readManifestStub(
  _buffer: Buffer,
  _mimeType: string,
): Promise<C2paResult | null> {
  // Stub: until c2pa-node is installed, no manifest detection happens.
  // Subscriber's explicit toggle (Phase 1) carries the load.
  return null;
}

/**
 * Match a claim_generator string against known AI providers.
 *
 * Used by the real implementation once c2pa-node is wired. Conservative —
 * only flags as AI when claim_generator clearly identifies an AI tool.
 * Misses edge cases (custom-trained models, lesser-known generators); those
 * fall back to subscriber declaration.
 */
export function isKnownAiGenerator(claimGenerator: string): boolean {
  if (!claimGenerator) return false;
  const lower = claimGenerator.toLowerCase();
  const aiSignals = [
    "firefly",         // Adobe Firefly
    "openai",          // OpenAI / DALL-E / Sora
    "dall-e",
    "imagen",          // Google Imagen
    "veo",             // Google Veo
    "midjourney",
    "stability",       // Stability AI
    "stable diffusion",
    "runway",          // Runway ML
    "kling",           // Kling AI (video)
    "sora",            // OpenAI Sora
    "leonardo",        // Leonardo.ai
    "ideogram",
    "flux",            // Flux models
    "synthid",         // Google watermark indicator (rare in claim_generator but possible)
  ];
  return aiSignals.some((sig) => lower.includes(sig));
}
