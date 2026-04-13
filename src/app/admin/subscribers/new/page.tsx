"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewSubscriberPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [plan, setPlan] = useState("pro");
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyApiKey() {
    if (!result?.api_key) return;
    await navigator.clipboard.writeText(result.api_key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ id: string; api_key: string } | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, plan, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create subscriber");
        return;
      }
      setResult({ id: data.subscriber.id, api_key: data.api_key });
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg">
        <Link href="/admin/subscribers" className="text-xs text-muted hover:text-accent">
          &larr; Subscribers
        </Link>
        <h1 className="mt-2 mb-6 text-lg font-semibold">Subscriber Created</h1>

        <div className="rounded-lg border border-success/30 bg-surface p-5">
          <p className="mb-4 text-sm text-success">Subscriber &ldquo;{name}&rdquo; created successfully.</p>

          <div className="mb-4">
            <label className="mb-1 block text-xs text-muted">Dashboard Login</label>
            <div className="rounded border border-border bg-background px-3 py-2 text-xs">
              {email}
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs text-muted">API Key (for programmatic access — shown only once)</label>
            <div className="relative rounded border border-border bg-background px-3 py-2 pr-16 font-mono text-xs break-all">
              {result.api_key}
              <button
                type="button"
                onClick={copyApiKey}
                className="absolute right-1 top-1 rounded border border-border bg-surface px-2 py-1 text-[10px] font-sans text-muted hover:text-foreground"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <Link
              href={`/admin/subscribers/${result.id}`}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              View Subscriber
            </Link>
            <Link
              href={`/admin/subscribers/${result.id}/sites/new`}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface"
            >
              Add Site
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/admin/subscribers" className="text-xs text-muted hover:text-accent">
        &larr; Subscribers
      </Link>
      <h1 className="mt-2 mb-6 text-lg font-semibold">New Subscriber</h1>

      <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface p-5">
        <div className="mb-4">
          <label className="mb-1 block text-xs text-muted">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            placeholder="Company or subscriber name"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs text-muted">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            placeholder="subscriber@example.com"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs text-muted">Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded border border-border bg-background px-3 py-2 pr-10 text-sm text-foreground outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-xs text-muted hover:text-foreground"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-1 block text-xs text-muted">Plan</label>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          >
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </div>

        {error && <p className="mb-4 text-xs text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading || !name || !email || !password}
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Subscriber"}
        </button>
      </form>
    </div>
  );
}
