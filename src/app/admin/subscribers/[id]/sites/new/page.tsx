"use client";

import { useState, use } from "react";
import Link from "next/link";

export default function NewSitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: subscriberId } = use(params);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [blogUrl, setBlogUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ id: string } | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/admin/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriber_id: subscriberId, name, domain, blog_url: blogUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create site");
        return;
      }
      setResult({ id: data.site.id });
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg">
        <Link href={`/admin/subscribers/${subscriberId}`} className="text-xs text-muted hover:text-accent">
          &larr; Back to subscriber
        </Link>
        <h1 className="mt-2 mb-6 text-lg font-semibold">Site Created</h1>
        <div className="rounded-lg border border-success/30 bg-surface p-5">
          <p className="mb-4 text-sm text-success">Site &ldquo;{name}&rdquo; created successfully.</p>
          <div className="mb-4">
            <label className="mb-1 block text-xs text-muted">Site ID</label>
            <div className="rounded border border-border bg-background px-3 py-2 font-mono text-xs">
              {result.id}
            </div>
          </div>
          <Link
            href={`/admin/subscribers/${subscriberId}`}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            View Subscriber
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <Link href={`/admin/subscribers/${subscriberId}`} className="text-xs text-muted hover:text-accent">
        &larr; Back to subscriber
      </Link>
      <h1 className="mt-2 mb-6 text-lg font-semibold">Add Site</h1>

      <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-surface p-5">
        <div className="mb-4">
          <label className="mb-1 block text-xs text-muted">Site Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            placeholder="e.g. Hektor K9"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs text-muted">Domain</label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            required
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            placeholder="hektork9.com"
          />
        </div>

        <div className="mb-6">
          <label className="mb-1 block text-xs text-muted">Blog URL</label>
          <input
            type="url"
            value={blogUrl}
            onChange={(e) => setBlogUrl(e.target.value)}
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            placeholder="https://hektork9.com/blog"
          />
        </div>

        {error && <p className="mb-4 text-xs text-danger">{error}</p>}

        <button
          type="submit"
          disabled={loading || !name || !domain}
          className="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create Site"}
        </button>
      </form>
    </div>
  );
}
