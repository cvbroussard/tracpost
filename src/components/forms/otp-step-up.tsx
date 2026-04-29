"use client";

import { useState, useEffect, useRef } from "react";

interface Props {
  open: boolean;
  action: string;
  actionLabel: string;
  message?: string;
  onCancel: () => void;
  onVerified: (code: string) => Promise<void>;
}

/**
 * Modal that prompts for a 6-digit OTP code emailed to the owner's address
 * before a protected action proceeds.
 *
 * Usage pattern (caller side):
 *   1. Caller attempts the destructive action with no otp_code
 *   2. Backend returns 401 with `{ otp_required: true, action }`
 *   3. Caller opens this modal, passes onVerified
 *   4. User enters code; onVerified(code) re-runs the destructive call
 *      with the code in the body
 *   5. If verification succeeds, backend proceeds; modal closes
 *   6. If verification fails, modal stays open and shows error
 */
export function OtpStepUp({
  open,
  action,
  actionLabel,
  message,
  onCancel,
  onVerified,
}: Props) {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCode("");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Enter the 6-digit code from your email");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onVerified(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="otp-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#fff",
          borderRadius: 16,
          padding: "28px 26px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.18)",
        }}
      >
        <h2
          id="otp-title"
          style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}
        >
          Confirm with email code
        </h2>
        <p style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.5, margin: "0 0 16px" }}>
          {message ||
            `Before we ${actionLabel.toLowerCase()}, we sent a 6-digit code to your email. Enter it below to confirm.`}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 6);
              setCode(v);
              setError(null);
            }}
            placeholder="123456"
            style={{
              width: "100%",
              padding: "14px 16px",
              fontSize: 22,
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              letterSpacing: 8,
              textAlign: "center",
              border: `1px solid ${error ? "#ef4444" : "#c5cbd3"}`,
              borderRadius: 10,
              background: error ? "#fef2f2" : "#f9fafb",
              color: "#1a1a1a",
              outline: "none",
            }}
            aria-label="Verification code"
          />
          {error && (
            <p
              style={{
                fontSize: 12,
                color: "#c53030",
                margin: "6px 0 0",
                lineHeight: 1.4,
              }}
            >
              {error}
            </p>
          )}

          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
              marginTop: 18,
            }}
          >
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              style={{
                padding: "9px 16px",
                fontSize: 13,
                fontWeight: 500,
                background: "transparent",
                color: "#4b5563",
                border: "1px solid var(--color-border, #e5e7eb)",
                borderRadius: 999,
                cursor: submitting ? "not-allowed" : "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || code.length !== 6}
              style={{
                padding: "9px 20px",
                fontSize: 13,
                fontWeight: 600,
                background: "#1a1a1a",
                color: "#fff",
                border: "none",
                borderRadius: 999,
                cursor: submitting || code.length !== 6 ? "not-allowed" : "pointer",
                opacity: submitting || code.length !== 6 ? 0.5 : 1,
              }}
            >
              {submitting ? "Verifying…" : `Confirm ${actionLabel.toLowerCase()}`}
            </button>
          </div>
        </form>

        <p
          style={{
            fontSize: 11,
            color: "#9ca3af",
            margin: "16px 0 0",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Didn&apos;t get the code? Check spam, or close and retry to send a new one.{" "}
          Codes expire in 10 minutes.
        </p>
      </div>
    </div>
  );
}
