/**
 * Toast + Confirm — imperative drop-in replacements for window.alert and
 * window.confirm. Mount <FeedbackHost /> once at the app root.
 *
 * Usage:
 *   import { toast, confirm } from "@/components/feedback";
 *
 *   toast.success("Saved");
 *   toast.error("Save failed: " + msg);
 *   toast.info("Capturing...");
 *
 *   if (!await confirm({ title: "Delete this post?", danger: true })) return;
 */
"use client";

import { useState, useEffect } from "react";

type Severity = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  severity: Severity;
  message: string;
  ttl: number;
}

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  id: number;
  resolve: (ok: boolean) => void;
}

// ── Tiny event bus (module-level) ─────────────────────────────────────────
type Listener<T> = (payload: T) => void;
function makeBus<T>() {
  const listeners = new Set<Listener<T>>();
  return {
    emit: (p: T) => { for (const l of listeners) l(p); },
    on: (l: Listener<T>) => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

const toastBus = makeBus<Toast>();
const confirmBus = makeBus<PendingConfirm>();
let nextId = 1;

// ── Public imperative API ─────────────────────────────────────────────────
function emitToast(severity: Severity, message: string, ttl = 4000) {
  toastBus.emit({ id: nextId++, severity, message, ttl });
}

export const toast = {
  success: (m: string) => emitToast("success", m),
  error: (m: string) => emitToast("error", m, 6000),
  info: (m: string) => emitToast("info", m),
  warning: (m: string) => emitToast("warning", m),
};

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmBus.emit({ ...opts, id: nextId++, resolve });
  });
}

// ── Host component (mount once) ───────────────────────────────────────────
const SEVERITY_STYLES: Record<Severity, { bg: string; text: string; border: string; icon: string }> = {
  success: { bg: "bg-success/10", text: "text-success", border: "border-success/30", icon: "✓" },
  error:   { bg: "bg-danger/10",  text: "text-danger",  border: "border-danger/30",  icon: "✕" },
  warning: { bg: "bg-warning/10", text: "text-warning", border: "border-warning/30", icon: "!" },
  info:    { bg: "bg-accent/10",  text: "text-accent",  border: "border-accent/30",  icon: "i" },
};

export function FeedbackHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirms, setConfirms] = useState<PendingConfirm[]>([]);

  useEffect(() => {
    const offToast = toastBus.on((t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), t.ttl);
    });
    const offConfirm = confirmBus.on((c) => {
      setConfirms((prev) => [...prev, c]);
    });
    return () => { offToast(); offConfirm(); };
  }, []);

  function resolveConfirm(id: number, ok: boolean) {
    setConfirms((prev) => {
      const c = prev.find((x) => x.id === id);
      if (c) c.resolve(ok);
      return prev.filter((x) => x.id !== id);
    });
  }

  return (
    <>
      {/* Toasts: bottom-right stack */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 max-w-sm">
        {toasts.map((t) => {
          const s = SEVERITY_STYLES[t.severity];
          return (
            <div
              key={t.id}
              className={`pointer-events-auto rounded-lg border ${s.border} ${s.bg} px-3 py-2 shadow-lg backdrop-blur-sm flex items-start gap-2`}
            >
              <span className={`${s.text} text-xs font-bold mt-0.5 shrink-0 w-4 h-4 rounded-full flex items-center justify-center`}>
                {s.icon}
              </span>
              <p className={`text-xs ${s.text} leading-relaxed flex-1`}>{t.message}</p>
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="text-muted hover:text-foreground text-xs leading-none px-1"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Confirm dialogs (one at a time, but supports stacked) */}
      {confirms.map((c) => (
        <div
          key={c.id}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
          onClick={() => resolveConfirm(c.id, false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") resolveConfirm(c.id, false);
            if (e.key === "Enter") resolveConfirm(c.id, true);
          }}
          tabIndex={-1}
        >
          <div
            className="max-w-md w-full rounded-xl bg-surface shadow-xl border border-border p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm font-semibold mb-2">{c.title}</h2>
            {c.body && (
              <p className="text-xs text-muted leading-relaxed mb-4 whitespace-pre-wrap">{c.body}</p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => resolveConfirm(c.id, false)}
                className="rounded border border-border px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground hover:bg-surface-hover"
              >
                {c.cancelLabel || "Cancel"}
              </button>
              <button
                onClick={() => resolveConfirm(c.id, true)}
                autoFocus
                className={`rounded px-3 py-1.5 text-xs font-medium text-white ${c.danger ? "bg-danger hover:opacity-90" : "bg-accent hover:opacity-90"}`}
              >
                {c.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ))}
    </>
  );
}
