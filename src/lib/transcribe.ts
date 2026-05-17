import "server-only";

/**
 * Speech-to-text transcription via OpenAI.
 *
 * Two models supported:
 *   - `gpt-4o-transcribe` (DEFAULT, 2026-05-18) — newer model with a
 *     natural-language prompt parameter. Stronger proper-noun
 *     recognition. Returns plain JSON (no segments).
 *   - `whisper-1` (legacy) — original model. Vocabulary-list prompt
 *     only. Returns verbose_json with time-anchored `segments` —
 *     required for voice-over playback synchronization.
 *
 * Caller picks via `needsSegments`: true forces whisper-1 (voice-over
 * sources), false defaults to gpt-4o-transcribe for higher fidelity.
 *
 * Cost: roughly $0.006/min for both. Same OpenAI key.
 */

/** Time-anchored segment within a transcript. Maps text to playback
 * positions for click-to-seek navigation. Only produced by whisper-1
 * (gpt-4o-transcribe doesn't expose segments). */
export interface TranscribeSegment {
  start: number;  // seconds from audio start
  end: number;
  text: string;
}

export interface TranscribeResult {
  /** The transcript text. */
  text: string;
  /** Provider that produced this transcript (audit trail). */
  provider: string;
  /** Optional duration in seconds, if the provider returns it. */
  duration?: number;
  /** Optional language detection, if the provider returns it. */
  language?: string;
  /** Time-anchored segments. Only present when whisper-1 was used. */
  segments?: TranscribeSegment[];
}

export interface TranscribeOptions {
  /** Natural-language prompt (gpt-4o-transcribe) or vocabulary list
   * (whisper-1). Build via buildTranscriptionPromptForSite(). */
  prompt?: string;
  /** Force whisper-1 instead of gpt-4o-transcribe. Required for
   * voice-over capture where segment timestamps drive playback sync. */
  needsSegments?: boolean;
}

const OPENAI_TRANSCRIPTION_URL = "https://api.openai.com/v1/audio/transcriptions";

async function transcribeFromBlob(
  audioBlob: Blob,
  filename: string,
  opts: TranscribeOptions = {},
): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set — cannot transcribe");
  }

  // gpt-4o-transcribe is the default — better proper-noun recognition,
  // natural-language prompt support. Fall back to whisper-1 only when
  // the caller specifically needs time-anchored segments (voice-over).
  const model = opts.needsSegments ? "whisper-1" : "gpt-4o-transcribe";
  // gpt-4o-transcribe only supports "json" (text + minimal metadata).
  // whisper-1 supports "verbose_json" which includes segments + duration
  // + language detection. We pick per model.
  const responseFormat = model === "whisper-1" ? "verbose_json" : "json";

  const form = new FormData();
  form.append("file", audioBlob, filename);
  form.append("model", model);
  form.append("response_format", responseFormat);
  if (opts.prompt && opts.prompt.length > 0) {
    form.append("prompt", opts.prompt);
  }

  // TEMP DIAGNOSTIC (2026-05-18) — visible in Vercel function logs.
  // Verifies which model is actually being called and what prompt is
  // reaching the API. Remove after the gpt-4o-transcribe payload
  // question is resolved.
  console.log(
    `[transcribe] → OpenAI model=${model} response_format=${responseFormat} ` +
    `file=${filename} size=${audioBlob.size}b promptLen=${opts.prompt?.length ?? 0}`
  );
  if (opts.prompt) {
    console.log(`[transcribe] prompt: ${opts.prompt.slice(0, 500)}${opts.prompt.length > 500 ? "…" : ""}`);
  }

  const res = await fetch(OPENAI_TRANSCRIPTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI ${model} error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    text: string;
    duration?: number;
    language?: string;
    segments?: Array<{ start: number; end: number; text: string }>;
  };

  return {
    text: (data.text || "").trim(),
    provider: `openai-${model}`,
    duration: data.duration,
    language: data.language,
    segments: Array.isArray(data.segments)
      ? data.segments.map((s) => ({
          start: s.start,
          end: s.end,
          text: (s.text || "").trim(),
        }))
      : undefined,
  };
}

function pickFilenameFromMime(mime: string | null | undefined, fallback = "audio.webm"): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("webm")) return "audio.webm";
  if (m.includes("ogg")) return "audio.ogg";
  if (m.includes("mp4") || m.includes("m4a")) return "audio.m4a";
  if (m.includes("mpeg") || m.includes("mp3")) return "audio.mp3";
  if (m.includes("wav")) return "audio.wav";
  if (m.includes("flac")) return "audio.flac";
  return fallback;
}

/**
 * Transcribe a Blob directly (no R2 fetch). Used by the
 * /api/recordings/transcribe-preview endpoint so subscribers can validate
 * a staged recording before committing — bytes never touch storage.
 *
 * Pass `opts.prompt` for vocabulary/instruction biasing. Pass
 * `opts.needsSegments` only if the caller needs time-anchored segments
 * (forces fallback to whisper-1).
 */
export async function transcribeBlob(
  audioBlob: Blob,
  mimeHint?: string,
  opts: TranscribeOptions = {},
): Promise<TranscribeResult> {
  const filename = pickFilenameFromMime(mimeHint || audioBlob.type);
  return transcribeFromBlob(audioBlob, filename, opts);
}

/**
 * Transcribe audio from a URL — fetches from R2, then runs OpenAI STT.
 *
 * Used by the legacy spoken-recording path on /api/recordings POST when
 * no precomputed transcript is provided.
 */
export async function transcribe(
  audioUrl: string,
  opts: TranscribeOptions = {},
): Promise<TranscribeResult> {
  const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(30000) });
  if (!audioRes.ok) {
    throw new Error(`Failed to fetch audio from R2: ${audioRes.status}`);
  }
  const audioBuffer = await audioRes.arrayBuffer();
  const contentType = audioRes.headers.get("content-type") || "audio/webm";
  const audioBlob = new Blob([audioBuffer], { type: contentType });

  const tail = audioUrl.split("/").pop() || "";
  const filename = /\.(webm|mp3|mp4|m4a|wav|ogg|opus|flac|mpeg|mpga)$/i.test(tail)
    ? tail
    : pickFilenameFromMime(contentType);

  return transcribeFromBlob(audioBlob, filename, opts);
}
