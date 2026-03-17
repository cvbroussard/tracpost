"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddSiteForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [blogUrl, setBlogUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domain, blog_url: blogUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create site");
        return;
      }

      // Refresh session to include new site
      await fetch("/api/auth/refresh-session", { method: "POST" });

      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-sm space-y-4">
      <div>
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
      <div>
        <label className="mb-1 block text-xs text-muted">Domain</label>
        <input
          type="text"
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          required
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          placeholder="hektork9.com"
        />
        <p className="mt-1 text-[10px] text-muted">Your brand&apos;s primary domain — used for social bio links and CTAs</p>
      </div>
      <div>
        <label className="mb-1 block text-xs text-muted">Blog URL</label>
        <input
          type="url"
          value={blogUrl}
          onChange={(e) => setBlogUrl(e.target.value)}
          required
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
          placeholder="https://hektork9.com/blog"
        />
        <p className="mt-1 text-[10px] text-muted">Where your blog posts live — we&apos;ll crawl here for content</p>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <button
        type="submit"
        disabled={loading || !name || !domain || !blogUrl}
        className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
      >
        {loading ? "Creating..." : "Add Site"}
      </button>
    </form>
  );
}
