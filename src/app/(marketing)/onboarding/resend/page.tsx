"use client";

import { useState } from "react";
import { ValidationHint, SupportChat } from "@/components/forms";

export const dynamic = "force-dynamic";

export default function ResendOnboardingPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  function isValidEmail(v: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setError("Enter a valid email address");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await fetch("/api/onboarding/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      setSent(true);
    } catch {
      setError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ background: "#fafafa", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ maxWidth: 460, width: "100%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: "40px 36px" }}>
        {sent ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", margin: "0 0 12px" }}>
              Check your inbox
            </h1>
            <p style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6, margin: 0 }}>
              If we found an in-progress onboarding for that email, a fresh link is on its way.
              No email after a few minutes? Check spam, or contact support.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", margin: "0 0 8px" }}>
              Resend your onboarding link
            </h1>
            <p style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6, margin: "0 0 24px" }}>
              Enter the email tied to your subscription. We&apos;ll send you a fresh link to pick up
              where you left off.
            </p>

            <form onSubmit={handleSubmit}>
              <label
                htmlFor="resend-email"
                style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 6 }}
              >
                Email
              </label>
              <input
                id="resend-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="you@yourbusiness.com"
                autoComplete="email"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  fontSize: 15,
                  border: `1px solid ${error ? "#ef4444" : "#c5cbd3"}`,
                  borderRadius: 8,
                  background: error ? "#fef2f2" : "#f9fafb",
                  color: "#1a1a1a",
                  marginBottom: error ? 0 : 14,
                }}
              />
              {error && <ValidationHint message={error} />}

              <button
                type="submit"
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: 13,
                  marginTop: 14,
                  fontSize: 14,
                  fontWeight: 600,
                  background: "#1a1a1a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? "Sending…" : "Send me a fresh link"}
              </button>
            </form>
          </>
        )}
      </div>
      <SupportChat context="signup" />
    </main>
  );
}
