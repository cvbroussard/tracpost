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
async function transcribeWithOpenAIWhisper(audioUrl: string): Promise<TranscribeResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set — cannot transcribe");
  }

  // Whisper requires multipart form upload of the audio bytes (no URL
  // input mode). Fetch the audio from R2, then forward to Whisper.
  const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(30000) });
  if (!audioRes.ok) {
    throw new Error(`Failed to fetch audio from R2: ${audioRes.status}`);
  }
  const audioBuffer = await audioRes.arrayBuffer();
  const audioBlob = new Blob([audioBuffer], {
    type: audioRes.headers.get("content-type") || "audio/webm",
  });

  // Filename is required by the Whisper API to detect format from extension.
  // Use the URL's tail or fall back to a generic name with .webm.
  const tail = audioUrl.split("/").pop() || "audio.webm";
  const filename = /\.(webm|mp3|mp4|m4a|wav|ogg|opus|flac|mpeg|mpga)$/i.test(tail)
    ? tail
    : "audio.webm";

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
      // Whisper returns more fields per segment (avg_logprob, no_speech_prob,
      // tokens, etc.) that we don't need for display. Strip to the three
      // we use; can revisit if a future use case wants the confidence signals.
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

/**
 * Public entry point — transcribe audio from a URL.
 *
 * Caller passes the audio's public R2 URL. Returns the transcript +
 * provenance. Throws on transcription failure; caller decides whether
 * to retry, mark the recording with an error state, or fall back.
 */
export async function transcribe(audioUrl: string): Promise<TranscribeResult> {
  // Single provider today. Add provider selection logic here if/when
  // the bake-off (#152) lands a clear winner alternative.
  return transcribeWithOpenAIWhisper(audioUrl);
}
