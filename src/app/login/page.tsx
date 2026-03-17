"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

      // In production, redirect to studio subdomain
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
        <h1 className="mb-1 text-center text-lg font-semibold">TracPost</h1>
        <p className="mb-8 text-center text-sm text-muted">Sign in to your dashboard</p>

        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-4">
            <label className="mb-1 block text-xs text-muted">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              placeholder="you@example.com"
              autoFocus
            />
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs text-muted">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            />
          </div>

          {error && <p className="mb-4 text-xs text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
