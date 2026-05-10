import "server-only";

/**
 * Speech-to-text transcription, pluggable provider.
 *
 * Phase 1 implementation (LOCKED 2026-05-09): OpenAI Whisper via fetch.
 * Future providers (Deepgram, AssemblyAI, etc.) implement the same
 * `transcribe(audioUrl)` interface and get registered here. Per task
 * #152, the bake-off evaluates alternatives against this baseline.
 *
 * The provider abstraction means callers (briefing flow, future
 * re-transcription jobs) don't change when we swap.
 */

/** Time-anchored segment within a transcript. Maps text to playback
 * positions for click-to-seek navigation (YouTube-style transcript view).
 * Captured for ALL transcripts even though we only DISPLAY them for
 * time-anchored sources (voice_over, captured_ambient) — see
 * project_tracpost_audio_capture_floor.md.
 */
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
  /** Time-anchored segments. Stored even for sources that don't display
   * timestamps so future operator review / clip extraction can use them. */
  segments?: TranscribeSegment[];
}

/**
 * Whisper API call via OpenAI. ~$0.006/minute. Quality is excellent for
 * English with technical/branded vocabulary (kitchen design jargon,
 * vendor names, etc.) — substantially better than browser-native Web
 * Speech API for our use case.
 *
 * Requires OPENAI_API_KEY in env. Throws if missing or API fails.
 */
async function whisperFromBlob(audioBlob: Blob, filename: string): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set — cannot transcribe");
  }

  const form = new FormData();
  form.append("file", audioBlob, filename);
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(120000), // up to 2 min for longer audio
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Whisper API error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    text: string;
    duration?: number;
    language?: string;
    segments?: Array<{
      start: number;
      end: number;
      text: string;
    }>;
  };

  return {
    text: (data.text || "").trim(),
    provider: "openai-whisper-1",
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
 */
export async function transcribeBlob(audioBlob: Blob, mimeHint?: string): Promise<TranscribeResult> {
  const filename = pickFilenameFromMime(mimeHint || audioBlob.type);
  return whisperFromBlob(audioBlob, filename);
}

/**
 * Transcribe audio from a URL — fetches from R2, then runs Whisper.
 *
 * Used by the legacy spoken-recording path on /api/recordings POST when
 * no precomputed transcript is provided.
 */
export async function transcribe(audioUrl: string): Promise<TranscribeResult> {
  const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(30000) });
  if (!audioRes.ok) {
    throw new Error(`Failed to fetch audio from R2: ${audioRes.status}`);
  }
  const audioBuffer = await audioRes.arrayBuffer();
  const contentType = audioRes.headers.get("content-type") || "audio/webm";
  const audioBlob = new Blob([audioBuffer], { type: contentType });

  // Prefer the URL's actual extension if it looks like one Whisper handles,
  // otherwise infer from MIME.
  const tail = audioUrl.split("/").pop() || "";
  const filename = /\.(webm|mp3|mp4|m4a|wav|ogg|opus|flac|mpeg|mpga)$/i.test(tail)
    ? tail
    : pickFilenameFromMime(contentType);

  return whisperFromBlob(audioBlob, filename);
}
