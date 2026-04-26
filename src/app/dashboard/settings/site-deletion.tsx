"use client";

import { useState } from "react";
import { toast } from "@/components/feedback";

interface SiteDeletionProps {
  siteId: string;
  siteName: string;
  deletionStatus: string | null;
  deletionRequestedAt: string | null;
}

export function SiteDeletion({
  siteId,
  siteName,
  deletionStatus: initialStatus,
  deletionRequestedAt,
}: SiteDeletionProps) {
  const [deletionStatus, setDeletionStatus] = useState(initialStatus);
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revoking, setRevoking] = useState(false);

  async function requestDeletion() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/sites/delete-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId, reason: reason || undefined }),
      });
      if (res.ok) {
        setDeletionStatus("pending");
        setShowConfirm(false);
      } else {
        const data = await res.json();
        toast.error(data.error || "Request failed");
      }
    } catch {
      toast.error("Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function restoreSite() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/toggle`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        await fetch("/api/auth/refresh-session", { method: "POST" });
        window.location.reload();
      } else {
        toast.error(data.error || "Restore failed");
      }
    } catch {
      toast.error("Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelRequest() {
    setRevoking(true);
    try {
      const res = await fetch("/api/sites/delete-request", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ siteId }),
      });
      if (res.ok) {
        setDeletionStatus(null);
      } else {
        const data = await res.json();
        toast.error(data.error || "Request failed");
      }
    } catch {
      toast.error("Request failed");
    } finally {
      setRevoking(false);
    }
  }

  if (deletionStatus === "pending") {
    return (
      <section className="mb-8">
        <div className="rounded-lg bg-warning/10 p-4">
          <p className="font-medium text-warning">Site deletion requested</p>
          <p className="mt-1 text-sm text-muted">
            Your request to delete <strong>{siteName}</strong> is pending review.
            {deletionRequestedAt && (
              <> Submitted {new Date(deletionRequestedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}.</>
            )}
            {" "}The platform team will review and process your request. Your data remains intact until approved.
          </p>
          <button
            onClick={cancelRequest}
            disabled={revoking}
            className="mt-3 bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {revoking ? "Cancelling..." : "Cancel Request"}
          </button>
        </div>
      </section>
    );
  }

  if (deletionStatus === "approved") {
    return (
      <section className="mb-8">
        <div className="rounded-lg bg-danger/10 p-4">
          <p className="font-medium text-danger">Site scheduled for deletion</p>
          <p className="mt-1 text-sm text-muted">
            <strong>{siteName}</strong> has been approved for deletion and will be removed within 30 days.
            Export your data before then.
          </p>
          {showConfirm ? (
            <div className="mt-3 flex gap-3">
              <button
                onClick={restoreSite}
                disabled={submitting}
                className="bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {submitting ? "Restoring..." : "Confirm Restore"}
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-1.5 text-sm text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowConfirm(true)}
              className="mt-3 border border-accent/40 px-4 py-1.5 text-sm font-medium text-accent hover:bg-accent/10"
            >
              Restore This Site
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mb-8">
      <h2 className="mb-1 text-muted">Delete Site</h2>
      <p className="mb-4 text-sm text-muted">
        Request deletion of <strong>{siteName}</strong>. The platform team will review your request.
        Your data is preserved until the request is approved.
      </p>

      {showConfirm ? (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">
              Why are you deleting this site? (optional)
            </label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Closing this location, consolidating sites, etc."
              className="w-full px-3 py-2.5"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={requestDeletion}
              disabled={submitting}
              className="bg-danger px-4 py-2 text-sm font-medium text-white hover:opacity-80 disabled:opacity-50"
            >
              {submitting ? "Submitting..." : "Request Deletion"}
            </button>
            <button
              onClick={() => setShowConfirm(false)}
              className="border border-border px-4 py-2 text-sm text-muted hover:text-foreground"
            >
              Never mind
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowConfirm(true)}
          className="border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger/10"
        >
          Delete This Site
        </button>
      )}
    </section>
  );
}
