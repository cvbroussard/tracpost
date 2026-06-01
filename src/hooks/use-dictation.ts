"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/**
 * Lightweight dictation hook for the ops brand-identity interview.
 *
 * Flow: idle → start() (getUserMedia + MediaRecorder) → recording → stop()
 * → transcribing (POST to the operator-gated /api/ops/brand-identity/transcribe)
 * → onTranscript(text) → idle.
 *
 * Deliberately simpler than useAudioBriefing: no staging, no R2, no recording
 * row. v1 dictation just turns speech into the descriptor's declared text.
 * The MediaRecorder logic mirrors useAudioBriefing (the proven path).
 */
export type DictationState = "idle" | "recording" | "transcribing" | "error";

interface UseDictationOpts {
  siteId: string;
  onTranscript: (text: string) => void;
  onError?: (e: Error) => void;
}

const MIN_RECORDING_MS = 600;

export function useDictation({ siteId, onTranscript, onError }: UseDictationOpts) {
  const [supported, setSupported] = useState(false);
  const [state, setState] = useState<DictationState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  onTranscriptRef.current = onTranscript;
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

  function teardown() {
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

  const start = useCallback(async () => {
    if (state === "recording" || state === "transcribing") return;
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
      teardown();
      setState("error");
      onErrorRef.current?.(err instanceof Error ? err : new Error("Mic access failed"));
      setTimeout(() => setState("idle"), 1500);
    }
  }, [state]);

  const stop = useCallback(async () => {
    if (state !== "recording") return;
    const recorder = recorderRef.current;
    if (!recorder) return;

    const blob: Blob = await new Promise((resolve) => {
      recorder.onstop = () =>
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      try {
        recorder.stop();
      } catch {
        /* noop */
      }
    });

    const durationMs = Date.now() - startedAtRef.current;
    teardown();
    setElapsedMs(0);
    if (blob.size === 0 || durationMs < MIN_RECORDING_MS) {
      setState("idle");
      return;
    }

    setState("transcribing");
    try {
      const form = new FormData();
      form.append("file", blob, "audio.webm");
      form.append("site_id", siteId);
      const res = await fetch("/api/ops/brand-identity/transcribe", {
        method: "POST",
        body: form,
      });
      if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
      const { transcript } = await res.json();
      if (typeof transcript === "string" && transcript.trim()) {
        onTranscriptRef.current(transcript.trim());
      }
      setState("idle");
    } catch (err) {
      setState("error");
      onErrorRef.current?.(
        err instanceof Error ? err : new Error("Transcription failed"),
      );
      setTimeout(() => setState("idle"), 1500);
    }
  }, [state, siteId]);

  const cancel = useCallback(() => {
    teardown();
    setState("idle");
    setElapsedMs(0);
  }, []);

  useEffect(() => () => teardown(), []);

  return { supported, state, elapsedMs, start, stop, cancel };
}
