"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);

  // Handle error params from magic link redirects
  const urlError = searchParams.get("error");
  const errorMessages: Record<string, string> = {
    invalid_link: "Invalid sign-in link.",
    link_expired: "This sign-in link has expired. Request a new one.",
    mobile_only: "This account is mobile-only. Use the TracPost Studio app instead.",
  };

  async function sendMagicLink() {
    if (!email) return;
    setMagicLoading(true);
    setError("");
    try {
      await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setMagicSent(true);
    } catch {
      setError("Failed to send sign-in link");
    } finally {
      setMagicLoading(false);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Invalid credentials");
        return;
      }

      // Route to the surface this principal belongs to. Platform/operator staff
      // land on their console; everyone else lands in studio.
      const principalType = data.principalType as string | undefined;
      const isProduction = window.location.hostname.endsWith("tracpost.com");
      if (isProduction) {
        window.location.href =
          principalType === "platform"
            ? "https://platform.tracpost.com/"
            : principalType === "operator"
              ? "https://manage.tracpost.com/"
              : "https://studio.tracpost.com/";
      } else {
        router.push(
          principalType === "platform"
            ? "/admin"
            : principalType === "operator"
              ? "/manage"
              : "/dashboard",
        );
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

        {/* URL error messages */}
        {urlError && errorMessages[urlError] && (
          <p className="mb-4 rounded bg-warning/10 p-3 text-center text-sm text-warning">
            {errorMessages[urlError]}
          </p>
        )}

        {magicSent ? (
          <div className="text-center">
            <p className="text-sm text-success">Check your email for a sign-in link.</p>
            <p className="mt-2 text-sm text-muted">
              The link expires in 7 days. Once signed in, you can optionally set a password in My Account.
            </p>
            <button
              onClick={() => { setMagicSent(false); setShowPasswordForm(false); }}
              className="mt-4 text-sm text-muted hover:text-foreground"
            >
              Back to sign in
            </button>
          </div>
        ) : !showPasswordForm ? (
          <>
            {/* Magic link — primary */}
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendMagicLink()}
                  required
                  placeholder="you@example.com"
                  autoFocus
                  className="w-full px-3 py-2.5"
                />
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}

              <button
                onClick={sendMagicLink}
                disabled={magicLoading || !email}
                className="w-full bg-accent py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {magicLoading ? "Sending..." : "Email me a sign-in link"}
              </button>
            </div>

            <button
              onClick={() => setShowPasswordForm(true)}
              className="mt-4 w-full text-center text-sm text-muted hover:text-foreground"
            >
              Use password instead
            </button>
          </>
        ) : (
          <>
            {/* Password login — secondary */}
            <form onSubmit={handlePasswordSubmit} className="space-y-4">
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

            <button
              onClick={() => { setShowPasswordForm(false); setError(""); }}
              className="mt-4 w-full text-center text-sm text-muted hover:text-foreground"
            >
              Use sign-in link instead
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
