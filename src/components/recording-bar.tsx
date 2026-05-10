"use client";

/**
 * RecordingBar — top-of-modal capture controls.
 *
 * Owns the visual state machine for ONE recording instance (briefing OR
 * voice-over). The parent modal instantiates a useAudioBriefing hook and
 * passes it in — the bar reads state + invokes actions.
 *
 * Single-button-double-duty design:
 *   IDLE      → [🎤 Start]
 *   RECORDING → [⏸ Pause]   [⏹ Stop]    + elapsed timer + red pulse
 *   PAUSED    → [▶ Resume]  [⏹ Stop]    + elapsed timer + paused indicator
 *   PREVIEWING → [Transcribing…]                (no actions)
 *   STAGED    → [🎤 Re-record] [Discard] + duration + "saves with asset"
 *   COMMITTING → [Saving recording…]            (no actions)
 *   COMMITTED → [✓ Recorded]                    (transient)
 *   ERROR     → [Mic error]                      (auto-recovers)
 *
 * For video assets the modal renders TWO bars side-by-side (Briefing +
 * Voice-over). Each owns its own state and commits independently.
 *
 * See project_tracpost_recording_as_canonical.md.
 */

import type { BriefingState } from "@/hooks/use-audio-briefing";

interface RecordingHook {
  supported: boolean;
  state: BriefingState;
  elapsedMs: number;
  stagedDurationMs: number;
  previewTranscript: string;
  start: () => Promise<void> | void;
  pauseResume: () => void;
  stop: () => Promise<void> | void;
  discard: () => void;
  cancel: () => void;
}

interface RecordingBarProps {
  label: string;
  audio: RecordingHook;
  /** Mic icon — visually distinguishes briefing vs voice-over. */
  icon?: string;
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

export function RecordingBar({ label, audio, icon = "🎤" }: RecordingBarProps) {
  if (!audio.supported) {
    return (
      <div className="rounded border border-border bg-surface-hover px-3 py-2 text-[11px] text-muted">
        {label}: audio capture not supported in this browser
      </div>
    );
  }

  const isRecording = audio.state === "recording";
  const isPaused = audio.state === "paused";
  const isPreviewing = audio.state === "previewing";
  const isStaged = audio.state === "staged";
  const isCommitting = audio.state === "committing";
  const isCommitted = audio.state === "committed";
  const isError = audio.state === "error";

  return (
    <div className="rounded border border-accent/30 bg-accent/5 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        {/* Left: label + state indicator */}
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-medium text-accent">{label}</span>
          {isRecording && (
            <span className="text-[10px] text-danger">
              <span className="animate-pulse">●</span> {fmtMs(audio.elapsedMs)}
            </span>
          )}
          {isPaused && (
            <span className="text-[10px] text-warning">
              ⏸ {fmtMs(audio.elapsedMs)}
            </span>
          )}
          {isPreviewing && (
            <span className="text-[10px] text-muted">Transcribing preview…</span>
          )}
          {isStaged && (
            <span className="text-[10px] text-success">
              ✓ Recorded ({fmtMs(audio.stagedDurationMs)}) — saves with asset
            </span>
          )}
          {isCommitting && (
            <span className="text-[10px] text-muted">Saving recording…</span>
          )}
          {isCommitted && (
            <span className="text-[10px] text-success">✓ Saved</span>
          )}
          {isError && (
            <span className="text-[10px] text-danger">⚠ Audio error</span>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1">
          {/* Primary action button — single slot, behavior changes by state */}
          {(audio.state === "idle" || isCommitted || isError) && (
            <button
              type="button"
              onClick={() => audio.start()}
              className="rounded border border-border bg-surface-hover px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-accent/40"
            >
              {icon} Start
            </button>
          )}

          {isRecording && (
            <>
              <button
                type="button"
                onClick={() => audio.pauseResume()}
                className="rounded border border-border bg-surface-hover px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-accent/40"
                title="Pause recording"
              >
                ⏸ Pause
              </button>
              <button
                type="button"
                onClick={() => audio.stop()}
                className="rounded border border-danger/40 bg-danger/10 px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-danger/20"
                title="Stop and review transcript"
              >
                ⏹ Stop
              </button>
            </>
          )}

          {isPaused && (
            <>
              <button
                type="button"
                onClick={() => audio.pauseResume()}
                className="rounded border border-warning/40 bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning hover:bg-warning/20"
                title="Resume recording"
              >
                ▶ Resume
              </button>
              <button
                type="button"
                onClick={() => audio.stop()}
                className="rounded border border-danger/40 bg-danger/10 px-2.5 py-1 text-[11px] font-medium text-danger hover:bg-danger/20"
              >
                ⏹ Stop
              </button>
            </>
          )}

          {isStaged && (
            <>
              <button
                type="button"
                onClick={() => audio.start()}
                className="rounded border border-border bg-surface-hover px-2.5 py-1 text-[11px] font-medium text-foreground hover:border-accent/40"
                title="Replace this take"
              >
                {icon} Re-record
              </button>
              <button
                type="button"
                onClick={() => audio.discard()}
                className="rounded border border-border px-2.5 py-1 text-[11px] text-muted hover:text-foreground"
                title="Throw away this take"
              >
                Discard
              </button>
            </>
          )}

          {(isPreviewing || isCommitting) && (
            <span className="px-2.5 py-1 text-[11px] text-muted">…</span>
          )}
        </div>
      </div>

      {/* Staged transcript preview — gives the subscriber a beat to
          read what was captured before they commit. */}
      {isStaged && (
        <StagedTranscriptPreview audio={audio} />
      )}
    </div>
  );
}

function StagedTranscriptPreview({ audio }: { audio: RecordingHook }) {
  const transcript = audio.previewTranscript;
  if (!transcript.trim()) {
    return (
      <div className="mt-2 text-[11px] italic text-muted">
        Transcript will appear when audio finishes processing. You can still commit or discard.
      </div>
    );
  }
  return (
    <div className="mt-2 max-h-32 overflow-y-auto rounded bg-background/40 p-2 text-[12px] text-foreground/90">
      {transcript}
    </div>
  );
}
