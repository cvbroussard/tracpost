"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Invalid credentials");
        return;
      }

      const isStudio =
        window.location.hostname === "studio.tracpost.com";
      const isProduction =
        window.location.hostname.endsWith("tracpost.com");
      if (isProduction && !isStudio) {
        window.location.href = "https://studio.tracpost.com/";
      } else {
        router.push(isStudio ? "/" : "/dashboard");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-8">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <img src="/icon.svg" alt="TracPost" className="mb-4 h-10 w-10" />
          <h1 className="text-center">TracPost</h1>
          <p className="mt-1 text-center text-muted">Sign in to your dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              autoFocus
              className="w-full px-3 py-2.5"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2.5 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full bg-accent py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Forgot password */}
        {!forgotMode && !forgotSent && (
          <button
            onClick={() => setForgotMode(true)}
            className="mt-4 w-full text-center text-sm text-muted hover:text-foreground"
          >
            Forgot your password?
          </button>
        )}

        {forgotMode && !forgotSent && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted">
              Enter your email and we&apos;ll send you a sign-in link.
            </p>
            <button
              onClick={async () => {
                if (!email) return;
                setForgotLoading(true);
                try {
                  await fetch("/api/auth/forgot-password", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email }),
                  });
                  setForgotSent(true);
                } finally {
                  setForgotLoading(false);
                }
              }}
              disabled={forgotLoading || !email}
              className="w-full border border-border py-2 text-sm text-muted hover:text-foreground disabled:opacity-50"
            >
              {forgotLoading ? "Sending..." : "Send sign-in link"}
            </button>
            <button
              onClick={() => setForgotMode(false)}
              className="w-full text-center text-sm text-muted hover:text-foreground"
            >
              Back to sign in
            </button>
          </div>
        )}

        {forgotSent && (
          <div className="mt-4 text-center">
            <p className="text-sm text-success">Check your email for a sign-in link.</p>
            <p className="mt-1 text-sm text-muted">
              Once signed in, go to My Account to set a new password.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
