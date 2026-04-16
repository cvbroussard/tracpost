"use client";

import { useState, useRef, useCallback, useEffect } from "react";

// SpeechRecognition types declared in src/speech.d.ts
type SpeechRecognitionInstance = SpeechRecognition;

interface UseSpeechRecognitionOpts {
  lang?: string;
  onFinal?: (transcript: string) => void;
}

interface UseSpeechRecognitionReturn {
  supported: boolean;
  listening: boolean;
  interim: string;
  toggle: () => void;
  stop: () => void;
}

/**
 * Browser Web Speech API hook. Streams interim results for preview,
 * fires onFinal with committed text for insertion. Continuous mode —
 * stays on until the user toggles off. Interruptible: the user can
 * stop, type, resume without losing cursor context.
 *
 * Chrome uses Google's speech engine under the hood; Safari uses
 * Apple's on-device recognizer. Firefox hides the mic button
 * (supported = false).
 */
export function useSpeechRecognition(
  opts: UseSpeechRecognitionOpts = {},
): UseSpeechRecognitionReturn {
  const { lang = "en-US", onFinal } = opts;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRecognitionInstance | null>(null);
  const listeningRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    const SR =
      typeof window !== "undefined"
        ? (window.SpeechRecognition || window.webkitSpeechRecognition)
        : null;
    setSupported(!!SR);
  }, []);

  const stop = useCallback(() => {
    listeningRef.current = false;
    if (recRef.current) {
      recRef.current.stop();
      recRef.current = null;
    }
    setListening(false);
    setInterim("");
  }, []);

  const toggle = useCallback(() => {
    if (listening) {
      stop();
      return;
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalText += t;
        } else {
          interimText += t;
        }
      }
      setInterim(interimText);
      if (finalText && onFinalRef.current) {
        onFinalRef.current(finalText);
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        console.warn("Speech recognition permission denied");
      }
      stop();
    };

    rec.onend = () => {
      // Chrome sometimes auto-stops on silence. If we're still
      // "listening", restart to maintain continuous mode.
      if (recRef.current === rec && listeningRef.current) {
        try { rec.start(); } catch { stop(); }
      }
    };

    recRef.current = rec;
    listeningRef.current = true;
    setListening(true);
    setInterim("");
    rec.start();
  }, [listening, lang, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recRef.current) {
        recRef.current.stop();
        recRef.current = null;
      }
    };
  }, []);

  return { supported, listening, interim, toggle, stop };
}
