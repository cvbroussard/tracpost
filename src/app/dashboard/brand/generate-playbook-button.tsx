"use client";

import { useState } from "react";

export function GeneratePlaybookButton({ siteId }: { siteId: string }) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/brand-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "auto_generate", site_id: siteId }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json();
        setError(data.error || "Generation failed");
      }
    } catch {
      setError("Request failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="py-16 text-center">
      <h1>Brand Intelligence</h1>
      <p className="mt-2 mb-6 text-muted">
        Generate your brand playbook to shape how content is created.
      </p>
      {error && <p className="mb-4 text-sm text-danger">{error}</p>}
      <button
        onClick={generate}
        disabled={generating}
        className="bg-accent px-6 py-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
      >
        {generating ? "Generating playbook..." : "Generate Brand Playbook"}
      </button>
      {generating && (
        <p className="mt-4 text-xs text-muted">This may take a minute — analyzing your site and content...</p>
      )}
    </div>
  );
}
