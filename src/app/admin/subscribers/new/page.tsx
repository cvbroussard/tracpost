"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function NewSubscriberPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("pro");
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
        body: JSON.stringify({ name, plan }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create subscriber");
        return;
      }
      setResult({ id: data.id, api_key: data.api_key });
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
            <label className="mb-1 block text-xs text-muted">Subscriber ID</label>
            <div className="rounded border border-border bg-background px-3 py-2 font-mono text-xs">
              {result.id}
            </div>
          </div>

          <div className="mb-4">
            <label className="mb-1 block text-xs text-danger">API Key (save this — shown only once)</label>
            <div className="rounded border border-danger/30 bg-background px-3 py-2 font-mono text-xs break-all">
              {result.api_key}
            </div>
          </div>

          <div className="flex gap-3">
            <Link
              href={`/admin/subscribers/${result.id}`}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              View Subscriber
            </Link>
            <Link
              href={`/admin/subscribers/${result.id}/sites/new`}
              className="rounded-md border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-surface"
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
          disabled={loading || !name}
          className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Subscriber"}
        </button>
      </form>
    </div>
  );
}
