"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Audio capture hook with two-stage commit.
 *
 * State machine:
 *   idle → start() → recording → pauseResume() ↔ paused
 *                       ↓            ↓
 *                       stop()       stop()
 *                       ↓            ↓
 *                    previewing → staged → commit() → committing → committed
 *                                   ↓
 *                                 discard() → idle
 *                                   ↓
 *                                 start() → recording (replaces staged blob)
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
 * Re-recording from the staged state silently replaces the staged blob
 * (matches the "redo" mental model — subscriber said the latest take is
 * the one they want).
 *
 * Cancel() is the emergency teardown for any state — used by the modal
 * close paths or unmount.
 *
 * See project_tracpost_recording_as_canonical.md.
 */

export type BriefingState =
  | "idle"
  | "recording"
  | "paused"
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
}

interface UseAudioBriefingReturn {
  supported: boolean;
  state: BriefingState;
  elapsedMs: number;
  stagedDurationMs: number;
  previewTranscript: string;
  start: () => Promise<void>;
  pauseResume: () => void;
  stop: () => Promise<void>;
  discard: () => void;
  commit: () => Promise<{ recordingId: string; transcript: string } | null>;
  cancel: () => void;
}

export function useAudioBriefing(opts: UseAudioBriefingOpts): UseAudioBriefingReturn {
  const { siteId, sourceAssetId, source = "briefing", onCommitted, onError } = opts;

  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<BriefingState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stagedDurationMs, setStagedDurationMs] = useState(0);
  const [previewTranscript, setPreviewTranscript] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stagedBlobRef = useRef<Blob | null>(null);
  const startedAtRef = useRef<number>(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const onCommittedRef = useRef(onCommitted);
  const onErrorRef = useRef(onError);
  onCommittedRef.current = onCommitted;
  onErrorRef.current = onError;

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

  const pauseResume = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (state === "recording") {
      try {
        recorder.pause();
        if (tickerRef.current) {
          clearInterval(tickerRef.current);
          tickerRef.current = null;
        }
        setState("paused");
      } catch {
        /* noop */
      }
    } else if (state === "paused") {
      try {
        recorder.resume();
        const accumulated = elapsedMs;
        startedAtRef.current = Date.now() - accumulated;
        tickerRef.current = setInterval(() => {
          setElapsedMs(Date.now() - startedAtRef.current);
        }, 250);
        setState("recording");
      } catch {
        /* noop */
      }
    }
  }, [state, elapsedMs]);

  const stop = useCallback(async () => {
    if (state !== "recording" && state !== "paused") return;
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
    if (recorderRef.current && (state === "recording" || state === "paused")) {
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
    pauseResume,
    stop,
    discard,
    commit,
    cancel,
  };
}
