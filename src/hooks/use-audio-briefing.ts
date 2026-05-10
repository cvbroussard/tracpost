"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Audio capture hook with hard-pause state machine.
 *
 * State machine (LOCKED 2026-05-10 to option (a) hard-pause):
 *   idle → start() → recording → stop() → previewing → staged
 *                                                         ↓
 *                                                       commit() → committing → committed
 *                                                         ↓
 *                                                       discard() → idle
 *                                                         ↓
 *                                                       start() → recording (replaces staged blob)
 *
 * Pause is the same as Stop — there is no resume. Re-clicking the
 * primary record button from the staged state starts a NEW take that
 * silently replaces the prior staged blob. This matches voice-memo-app
 * mental models and removes the resume-vs-stop UX ambiguity.
 *
 * Stop() captures the blob in browser memory and calls
 * /api/recordings/transcribe-preview so the subscriber can VALIDATE the
 * transcript before committing. No R2 / DB side effects until commit().
 *
 * Commit() uploads the staged blob to R2 + creates a recording row with
 * the precomputed transcript (skipping a second Whisper call). The
 * modal's save flow calls commit() before issuing the asset PATCH.
 *
 * Discard() throws away the staged blob — bytes never leave the browser.
 *
 * Cancel() is the emergency teardown for any state — used by the modal
 * close paths or unmount.
 *
 * Lifecycle hooks: onStart and onStopRequested let the parent coordinate
 * external state (e.g., voice-over couples to video.play() / video.pause()
 * and captures video.currentTime as a metadata anchor).
 *
 * See project_tracpost_recording_as_canonical.md.
 */

export type BriefingState =
  | "idle"
  | "recording"
  | "previewing"
  | "staged"
  | "committing"
  | "committed"
  | "error";

const MIN_RECORDING_MS = 1000; // takes shorter than this auto-discard

interface UseAudioBriefingOpts {
  siteId: string;
  sourceAssetId?: string;
  source?: "briefing" | "voice_over" | "testimonial" | "captured_ambient";
  onCommitted?: (recordingId: string, transcript: string) => void;
  onError?: (err: Error) => void;
  /**
   * Fires just before recording starts. Voice-over uses this to call
   * video.play() and capture video.currentTime as the anchor offset.
   * Return any metadata (e.g., { video_offset_seconds: 12.4 }) — it gets
   * merged into the recording row's metadata at commit time.
   */
  onStart?: () => Record<string, unknown> | undefined;
  /**
   * Fires when stop() is invoked, before the audio actually stops.
   * Voice-over uses this to call video.pause() so audio + video pause
   * together. No return value.
   */
  onStopRequested?: () => void;
}

interface UseAudioBriefingReturn {
  supported: boolean;
  state: BriefingState;
  elapsedMs: number;
  stagedDurationMs: number;
  previewTranscript: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  discard: () => void;
  commit: () => Promise<{ recordingId: string; transcript: string } | null>;
  cancel: () => void;
}

export function useAudioBriefing(opts: UseAudioBriefingOpts): UseAudioBriefingReturn {
  const { siteId, sourceAssetId, source = "briefing", onCommitted, onError, onStart, onStopRequested } = opts;

  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<BriefingState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stagedDurationMs, setStagedDurationMs] = useState(0);
  const [previewTranscript, setPreviewTranscript] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stagedBlobRef = useRef<Blob | null>(null);
  const stagedMetadataRef = useRef<Record<string, unknown>>({});
  const startedAtRef = useRef<number>(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const onCommittedRef = useRef(onCommitted);
  const onErrorRef = useRef(onError);
  const onStartRef = useRef(onStart);
  const onStopRequestedRef = useRef(onStopRequested);
  onCommittedRef.current = onCommitted;
  onErrorRef.current = onError;
  onStartRef.current = onStart;
  onStopRequestedRef.current = onStopRequested;

  useEffect(() => {
    setSupported(
      typeof window !== "undefined" &&
        typeof window.MediaRecorder !== "undefined" &&
        !!navigator?.mediaDevices?.getUserMedia,
    );
  }, []);

  function pickMimeType(): string {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  function clearStreamAndRecorder() {
    if (tickerRef.current) {
      clearInterval(tickerRef.current);
      tickerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    chunksRef.current = [];
  }

  function clearStagedBlob() {
    stagedBlobRef.current = null;
    stagedMetadataRef.current = {};
    setPreviewTranscript("");
    setStagedDurationMs(0);
  }

  const start = useCallback(async () => {
    // From staged: silently replace the staged blob with a new take.
    if (state === "staged") {
      clearStagedBlob();
    } else if (state !== "idle" && state !== "committed" && state !== "error") {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      // Lifecycle hook — voice-over uses this to call video.play() and
      // capture video.currentTime as the anchor offset for time-anchored
      // segments later.
      const startMetadata = onStartRef.current?.() || {};
      stagedMetadataRef.current = { ...startMetadata };

      recorder.start(1000);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      tickerRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);
      setState("recording");
    } catch (err) {
      clearStreamAndRecorder();
      setState("error");
      const e = err instanceof Error ? err : new Error("Mic access failed");
      onErrorRef.current?.(e);
      setTimeout(() => setState("idle"), 1500);
    }
  }, [state]);

  const stop = useCallback(async () => {
    if (state !== "recording") return;
    // Lifecycle hook — voice-over uses this to call video.pause() so
    // audio + video pause together.
    onStopRequestedRef.current?.();
    const recorder = recorderRef.current;
    if (!recorder) return;

    const finalBlob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        resolve(new Blob(chunksRef.current, { type }));
      };
      try {
        recorder.stop();
      } catch {
        /* noop */
      }
    });

    const durationMs = Date.now() - startedAtRef.current;
    clearStreamAndRecorder();

    // Auto-discard accidental short clips.
    if (finalBlob.size === 0 || durationMs < MIN_RECORDING_MS) {
      setState("idle");
      setElapsedMs(0);
      return;
    }

    stagedBlobRef.current = finalBlob;
    setStagedDurationMs(durationMs);
    setState("previewing");

    // Run preview-transcribe so the subscriber can validate the take
    // before committing. Failure is non-fatal — they can still commit and
    // accept that the transcript will run on the server side later, or
    // they can discard.
    try {
      const form = new FormData();
      form.append("file", finalBlob, "audio.webm");
      const res = await fetch("/api/recordings/transcribe-preview", {
        method: "POST",
        body: form,
      });
      if (res.ok) {
        const { transcript } = await res.json();
        setPreviewTranscript(typeof transcript === "string" ? transcript : "");
      } else {
        setPreviewTranscript("");
      }
    } catch {
      setPreviewTranscript("");
    }

    setState("staged");
    setElapsedMs(0);
  }, [state]);

  const discard = useCallback(() => {
    clearStreamAndRecorder();
    clearStagedBlob();
    setState("idle");
    setElapsedMs(0);
  }, []);

  const commit = useCallback(async () => {
    if (state !== "staged") return null;
    const blob = stagedBlobRef.current;
    if (!blob) return null;
    const transcript = previewTranscript;
    const durationMs = stagedDurationMs;

    try {
      setState("committing");

      // Step 1 — presign + PUT to R2
      const presignRes = await fetch("/api/recordings/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, content_type: blob.type }),
      });
      if (!presignRes.ok) {
        const errBody = await presignRes.text().catch(() => "");
        throw new Error(`Presign failed (${presignRes.status}): ${errBody.slice(0, 200)}`);
      }
      const { upload_url, public_url } = await presignRes.json();

      const putRes = await fetch(upload_url, {
        method: "PUT",
        headers: { "Content-Type": blob.type },
        body: blob,
      });
      if (!putRes.ok) {
        throw new Error(`R2 upload failed (${putRes.status})`);
      }

      // Step 2 — register the recording row with the precomputed transcript
      // and any metadata captured at start (e.g., video_offset_seconds for V/O).
      const createRes = await fetch("/api/recordings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: siteId,
          source_asset_id: sourceAssetId || undefined,
          storage_url: public_url,
          mime_type: blob.type,
          duration_ms: durationMs,
          source,
          precomputed_transcript: transcript || undefined,
          metadata: stagedMetadataRef.current,
        }),
      });
      if (!createRes.ok) {
        const errBody = await createRes.text().catch(() => "");
        throw new Error(`Recording register failed (${createRes.status}): ${errBody.slice(0, 200)}`);
      }
      const { recording } = await createRes.json();

      clearStagedBlob();
      setState("committed");
      onCommittedRef.current?.(recording.id, transcript);
      return { recordingId: recording.id as string, transcript };
    } catch (err) {
      setState("error");
      const e = err instanceof Error ? err : new Error("Commit failed");
      onErrorRef.current?.(e);
      setTimeout(() => setState("staged"), 1500); // give them another shot
      return null;
    }
  }, [state, previewTranscript, stagedDurationMs, siteId, sourceAssetId, source]);

  const cancel = useCallback(() => {
    if (recorderRef.current && state === "recording") {
      try {
        recorderRef.current.stop();
      } catch {
        /* noop */
      }
    }
    clearStreamAndRecorder();
    clearStagedBlob();
    setState("idle");
    setElapsedMs(0);
  }, [state]);

  // Cleanup on unmount — releases mic if recording, drops staged blob
  useEffect(() => {
    return () => {
      clearStreamAndRecorder();
      stagedBlobRef.current = null;
    };
  }, []);

  return {
    supported,
    state,
    elapsedMs,
    stagedDurationMs,
    previewTranscript,
    start,
    stop,
    discard,
    commit,
    cancel,
  };
}
