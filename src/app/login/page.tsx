"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState("");
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
        body: JSON.stringify({ api_key: apiKey }),
      });

      if (!res.ok) {
        setError("Invalid API key");
        return;
      }

      router.push("/dashboard");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-8">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-lg font-semibold">SEO Suite</h1>
        <p className="mb-8 text-center text-sm text-muted">Sign in with your API key</p>

        <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-4">
            <label className="mb-1 block text-xs text-muted">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
              placeholder="seo_..."
              autoFocus
            />
          </div>

          {error && <p className="mb-4 text-xs text-danger">{error}</p>}

          <button
            type="submit"
            disabled={loading || !apiKey}
            className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
