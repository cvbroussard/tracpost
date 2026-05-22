"use client";

/**
 * AutoTagBar — sticky top toolbar of the asset modal.
 *
 * The analyze cascade was excised (briefing-only modal); the bar now
 * carries the Voice Over capture control + the navigation/save cluster.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │ [Voice Over]            | [Cancel] [Save] [Save & Next] [Close]     │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * Capture cluster (left):
 *   - Voice Over: only rendered for video assets. Capture controls for
 *     V/O still live here because they couple to the video player.
 *
 * Action cluster (right):
 *   - Cancel: discard ALL staged recordings + typed draft, stay on modal
 *   - Save: commit + stay on this asset
 *   - Save & Next: commit + advance to next asset
 *   - Close: dirty-form check + close modal (#183)
 */

import type { BriefingState } from "@/hooks/use-audio-briefing";

interface RecordingHook {
  supported: boolean;
  state: BriefingState;
  elapsedMs: number;
  stagedDurationMs: number;
  previewTranscript: string;
  start: () => Promise<void> | void;
  stop: () => Promise<void> | void;
  discard: () => void;
  cancel: () => void;
}

interface AutoTagBarProps {
  /** Audio hook — used only for "anyActive" gating on Cancel button.
   * The Record button itself lives in the Transcription card now. */
  audio: RecordingHook;
  /** Voice-over recording hook. Only used when isVideo is true. */
  voiceOver?: RecordingHook;
  isVideo: boolean;
  /** Cancel: discard all staged recordings + typed draft, stay on modal. */
  onCancel: () => void;
  /** Save: commit staged recordings + asset PATCH, stay on this asset. */
  onSave: () => void;
  /** Save & Next: commit + advance to next asset in the briefing pass. */
  onSaveAndNext: () => void;
  /** Previous: navigate to the prior asset in the briefing pass. */
  onPrev?: () => void;
  /** Close: dirty-form check + close modal. */
  onClose: () => void;
  saving: boolean;
  hasNext: boolean;
  hasPrev?: boolean;
}

function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
}

/**
 * Voice Over toggle button. Same Record/Pause toggle pattern as the
 * audio Record button, kept here because V/O capture is coupled to
 * the video player which lives in this top region.
 */
export function PrimaryToggleButton({
  audio,
  idleLabel,
  recordingLabel = "Pause",
}: {
  audio: RecordingHook;
  idleLabel: string;
  recordingLabel?: string;
}) {
  if (!audio.supported) {
    return (
      <button
        type="button"
        disabled
        className="cursor-not-allowed rounded border border-border px-3 py-1.5 text-[12px] font-medium text-muted/50"
        title="Audio capture not supported"
      >
        {idleLabel} (n/a)
      </button>
    );
  }

  const isRecording = audio.state === "recording";
  const isInteracting = audio.state === "previewing" || audio.state === "committing";

  if (isRecording) {
    return (
      <button
        type="button"
        onClick={() => audio.stop()}
        className="rounded border border-warning/40 bg-warning/10 px-3 py-1.5 text-[12px] font-medium text-warning hover:bg-warning/20"
        title="Pause and transcribe"
      >
        ⏸ {recordingLabel}
      </button>
    );
  }

  if (isInteracting) {
    return (
      <button
        type="button"
        disabled
        className="cursor-not-allowed rounded border border-border bg-surface-hover px-3 py-1.5 text-[12px] font-medium text-muted"
      >
        … {idleLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => audio.start()}
      className={`rounded border px-3 py-1.5 text-[12px] font-medium transition-colors ${
        audio.state === "staged"
          ? "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
          : "border-border bg-surface-hover text-foreground hover:border-accent/40"
      }`}
      title={audio.state === "staged" ? `Replace this ${idleLabel.toLowerCase()} take` : `Start ${idleLabel.toLowerCase()}`}
    >
      ● {idleLabel}
    </button>
  );
}

export function StateIndicator({ label, audio }: { label: string; audio: RecordingHook }) {
  if (audio.state === "recording") {
    return (
      <span className="text-[11px] text-danger">
        <span className="animate-pulse">●</span> {label} {fmtMs(audio.elapsedMs)}
      </span>
    );
  }
  if (audio.state === "previewing") {
    return <span className="text-[11px] text-muted">{label}: transcribing preview…</span>;
  }
  if (audio.state === "staged") {
    return (
      <span className="text-[11px] text-success">
        ✓ {label} ({fmtMs(audio.stagedDurationMs)}) — staged, saves with asset
      </span>
    );
  }
  if (audio.state === "committing") {
    return <span className="text-[11px] text-muted">{label}: saving…</span>;
  }
  if (audio.state === "committed") {
    return <span className="text-[11px] text-success">✓ {label} saved</span>;
  }
  if (audio.state === "error") {
    return <span className="text-[11px] text-danger">⚠ {label} error</span>;
  }
  return null;
}

export function StagedPreview({ label, audio }: { label: string; audio: RecordingHook }) {
  if (audio.state !== "staged") return null;
  const transcript = audio.previewTranscript.trim();
  if (!transcript) {
    return (
      <div className="rounded bg-background/40 px-2 py-1 text-[11px] italic text-muted">
        {label}: transcript pending — you can still save or discard.
      </div>
    );
  }
  return (
    <div className="rounded bg-background/40 px-2 py-1.5 text-[12px] text-foreground/90">
      <div className="mb-0.5 text-[9px] uppercase tracking-wide text-muted/70">{label} preview</div>
      {transcript}
    </div>
  );
}

export function AutoTagBar({
  audio,
  voiceOver,
  isVideo,
  onCancel,
  onSave,
  onSaveAndNext,
  onPrev,
  onClose,
  saving,
  hasNext,
  hasPrev,
}: AutoTagBarProps) {
  const anyActive =
    audio.state === "recording" ||
    audio.state === "previewing" ||
    audio.state === "staged" ||
    (voiceOver?.state === "recording" ||
      voiceOver?.state === "previewing" ||
      voiceOver?.state === "staged");

  return (
    <div className="rounded border border-accent/30 bg-accent/5 px-3 py-2.5">
      {/* Button row — Voice Over (for video) left, actions right */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          {isVideo && voiceOver && (
            <PrimaryToggleButton audio={voiceOver} idleLabel="Voice Over" />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={!anyActive}
            className="rounded border border-border px-2.5 py-1.5 text-[12px] font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            title="Discard all staged recordings (stays on this asset)"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded border border-border bg-surface-hover px-2.5 py-1.5 text-[12px] font-medium text-foreground hover:border-accent/40 disabled:opacity-50"
            title="Save staged recordings and asset changes (stays on this asset)"
          >
            Save
          </button>
          {hasPrev && onPrev && (
            <button
              type="button"
              onClick={onPrev}
              disabled={saving}
              className="rounded border border-border px-2.5 py-1.5 text-[12px] font-medium text-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              title="Go to previous asset in the briefing pass (←)"
            >
              ← Prev
            </button>
          )}
          <button
            type="button"
            onClick={onSaveAndNext}
            disabled={saving || !hasNext}
            className="rounded border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[12px] font-medium text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
            title="Save and advance to next asset (→)"
          >
            Save &amp; Next
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 rounded border border-border px-2.5 py-1.5 text-[12px] text-muted hover:text-foreground"
            title="Close modal (prompts if there are unsaved changes)"
          >
            Close
          </button>
        </div>
      </div>

      {/* V/O state indicator + staged preview (video only). Audio Record
          indicators live in the Transcription card now. */}
      {isVideo && voiceOver && voiceOver.state !== "idle" && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StateIndicator label="Voice-over" audio={voiceOver} />
        </div>
      )}
      {isVideo && voiceOver?.state === "staged" && (
        <div className="mt-2 space-y-1.5">
          <StagedPreview label="Voice-over" audio={voiceOver} />
        </div>
      )}
    </div>
  );
}
