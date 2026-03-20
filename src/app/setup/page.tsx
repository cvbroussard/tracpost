"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "business" | "complete";

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("business");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [location, setLocation] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleCreateSite() {
    if (!businessName || !businessType) return;
    setLoading(true);
    setError("");

    try {
      // Create site with business type + location
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: businessName,
          url: siteUrl ? (siteUrl.startsWith("http") ? siteUrl : `https://${siteUrl}`) : undefined,
          business_type: businessType,
          location: location || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to create site");
        setLoading(false);
        return;
      }

      // Update subscriber name to match business name
      await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: businessName }),
      }).catch(() => {});

      // Refresh session to include new site
      await fetch("/api/auth/refresh-session", { method: "POST" });

      // Mark onboarding complete
      await fetch("/api/account/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "complete" }),
      }).catch(() => {});

      // Fire auto-playbook generation in background (non-blocking)
      const siteData = await res.json();
      if (siteData.site?.id) {
        fetch("/api/brand-intelligence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            site_id: siteData.site.id,
            action: "auto_generate",
            business_type: businessType,
            location: location || undefined,
            website_url: siteUrl || undefined,
          }),
        }).catch(() => {}); // Fire and forget
      }

      setStep("complete");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (step === "complete") {
    return (
      <div className="flex min-h-screen items-center justify-center px-8">
        <div className="w-full max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <img src="/icon.svg" alt="TracPost" className="h-12 w-12" />
          </div>
          <h1 className="mb-2">You're all set</h1>
          <p className="mb-2 text-muted">
            {businessName} is ready. Your brand intelligence and content strategy are being assembled in the background.
          </p>
          <p className="mb-8 text-sm text-muted">
            Our team will set up your social accounts and notify you when everything is live. In the meantime, download the app and start capturing content.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                const isStudio = typeof window !== "undefined" && window.location.hostname === "studio.tracpost.com";
                router.push(isStudio ? "/" : "/dashboard");
              }}
              className="w-full bg-accent py-2.5 text-sm font-medium text-white"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <img src="/icon.svg" alt="TracPost" className="mb-4 h-10 w-10" />
          <h1 className="text-center">Welcome to TracPost</h1>
          <p className="mt-2 text-center text-muted">Tell us about your business — we'll handle the rest.</p>
        </div>

        <div className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium">Business name *</label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g., Hektor K9"
              autoFocus
              className="w-full px-3 py-2.5"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">What does your business do? *</label>
            <input
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              placeholder="e.g., Dog training, Photography, Real estate"
              className="w-full px-3 py-2.5"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., West Palm Beach, FL"
              className="w-full px-3 py-2.5"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Website URL</label>
            <input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="e.g., hektork9.com (optional)"
              className="w-full px-3 py-2.5"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            onClick={handleCreateSite}
            disabled={!businessName || !businessType || loading}
            className="w-full bg-accent py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? "Setting up..." : "Get Started"}
          </button>
        </div>
      </div>
    </div>
  );
}
