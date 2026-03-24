"use client";

import { useState } from "react";

export function AccountActions({
  cancelledAt,
}: {
  cancelledAt: string | null;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [redirectTarget, setRedirectTarget] = useState("");
  const [cancelled, setCancelled] = useState(!!cancelledAt);
  const [graceEnd, setGraceEnd] = useState<string | null>(
    cancelledAt ? graceEndDate(cancelledAt) : null
  );
  const [revoking, setRevoking] = useState(false);

  async function requestExport() {
    setExporting(true);
    try {
      const res = await fetch("/api/account/export", { method: "POST" });
      const data = await res.json();

      if (data.download_url) {
        setExportUrl(data.download_url);
      } else if (data.export_id) {
        pollExport(data.export_id);
      }
    } catch {
      alert("Export request failed");
      setExporting(false);
    }
  }

  async function pollExport(exportId: string) {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/account/export?export_id=${exportId}`);
        const data = await res.json();
        if (data.status === "completed" && data.download_url) {
          clearInterval(interval);
          setExportUrl(data.download_url);
          setExporting(false);
        } else if (data.status === "failed") {
          clearInterval(interval);
          alert("Export failed. Please try again.");
          setExporting(false);
        }
      } catch {
        // continue polling
      }
    }, 3000);
  }

  async function confirmCancel() {
    setCancelling(true);
    try {
      const res = await fetch("/api/account/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: cancelReason || undefined,
          redirect_target: redirectTarget || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCancelled(true);
        setGraceEnd(data.grace_ends);
        setShowCancelConfirm(false);
      } else {
        alert(data.error || "Cancellation failed");
      }
    } catch {
      alert("Cancellation request failed");
    } finally {
      setCancelling(false);
    }
  }

  async function revokeCancellation() {
    setRevoking(true);
    try {
      const res = await fetch("/api/account/cancel", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setCancelled(false);
        setGraceEnd(null);
      } else {
        alert(data.error || "Could not revoke cancellation");
      }
    } catch {
      alert("Request failed");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <>
      {/* Grace period banner */}
      {cancelled && graceEnd && (
        <div className="mb-8 rounded-lg bg-warning/10 p-4">
          <p className="font-medium text-warning">
            Your account is scheduled for cancellation
          </p>
          <p className="mt-1 text-sm text-muted">
            Your data will remain accessible until{" "}
            {new Date(graceEnd).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            . Export your data before then.
          </p>
          <button
            onClick={revokeCancellation}
            disabled={revoking}
            className="mt-3 bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {revoking ? "Revoking..." : "Keep My Account"}
          </button>
        </div>
      )}

      {/* Data Export */}
      <section className="mb-8">
        <h2 className="mb-1">Data Export</h2>
        <p className="mb-4 text-sm text-muted">
          Download all your content — blog posts, social captions, images, and
          configuration. You own everything.
        </p>

        {exportUrl ? (
          <div className="flex items-center gap-3">
            <a
              href={exportUrl}
              className="bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              download
            >
              Download Export
            </a>
            <span className="text-sm text-muted">Link expires in 7 days</span>
          </div>
        ) : (
          <button
            onClick={requestExport}
            disabled={exporting}
            className="border border-border px-4 py-2 text-sm text-muted transition-colors hover:border-foreground hover:text-foreground disabled:opacity-50"
          >
            {exporting ? "Building export..." : "Export My Data"}
          </button>
        )}
      </section>

      {/* Cancel Account */}
      {!cancelled && (
        <section className="mb-8">
          <h2 className="mb-1 text-muted">Cancel Account</h2>
          <p className="mb-4 text-sm text-muted">
            Your account stays active for 30 days after cancellation. Blog
            redirects stay active for 120 days. Export your data first.
          </p>

          {showCancelConfirm ? (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Reason (optional)
                </label>
                <input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Why are you leaving?"
                  className="w-full px-3 py-2.5"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">
                  Where is your blog moving? (optional)
                </label>
                <input
                  value={redirectTarget}
                  onChange={(e) => setRedirectTarget(e.target.value)}
                  placeholder="https://yourdomain.com/blog"
                  className="w-full px-3 py-2.5"
                />
                <p className="mt-1.5 text-sm text-muted">
                  We&apos;ll redirect your TracPost blog URLs here for 120 days
                  to preserve your SEO.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={confirmCancel}
                  disabled={cancelling}
                  className="bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-80 disabled:opacity-50"
                >
                  {cancelling ? "Cancelling..." : "Confirm Cancellation"}
                </button>
                <button
                  onClick={() => setShowCancelConfirm(false)}
                  className="border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
                >
                  Never mind
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCancelConfirm(true)}
              className="border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10"
            >
              Cancel My Account
            </button>
          )}
        </section>
      )}
    </>
  );
}

function graceEndDate(cancelledAt: string): string {
  const d = new Date(cancelledAt);
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}
