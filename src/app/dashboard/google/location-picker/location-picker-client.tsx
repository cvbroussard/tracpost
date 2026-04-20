"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Location {
  accountId: string;
  locationId: string;
  locationName: string;
  address: string;
}

interface PendingConnection {
  socialAccountId: string;
  email: string;
  initiatingSiteId: string | null;
  initiatingSiteName: string | null;
  locations: Location[];
}

interface Site {
  id: string;
  name: string;
}

interface Props {
  pendingConnections: PendingConnection[];
  sites: Site[];
}

export function LocationPickerClient({ pendingConnections, sites }: Props) {
  const router = useRouter();
  const [selections, setSelections] = useState<Record<string, { siteId: string; locationIndex: number } | null>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(new Set());

  async function assignLocation(
    socialAccountId: string,
    siteId: string,
    locationIndex: number,
  ) {
    setSaving(socialAccountId);

    try {
      const res = await fetch("/api/google/link-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          social_account_id: socialAccountId,
          site_id: siteId,
          location_index: locationIndex,
        }),
      });

      if (res.ok) {
        setCompleted((prev) => new Set([...prev, socialAccountId]));
      }
    } catch { /* ignore */ }

    setSaving(null);
  }

  const allDone = pendingConnections.every((pc) => completed.has(pc.socialAccountId));

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 shadow-card">
        <div className="mb-1 text-center">
          <span className="text-2xl">G</span>
        </div>
        <h2 className="text-center text-lg font-medium mb-1">Assign Google Business Location</h2>
        <p className="text-center text-xs text-muted mb-6">
          A tenant connected their Google account. Select the correct location for this site.
        </p>

        {pendingConnections.map((pc) => (
          <div key={pc.socialAccountId} className="mb-6">
            <div className="mb-3 rounded-lg bg-surface-hover px-3 py-2">
              <p className="text-xs">
                <span className="text-muted">Connected by:</span>{" "}
                <span className="font-medium">{pc.initiatingSiteName || "Unknown"}</span>
              </p>
              <p className="text-[10px] text-muted">{pc.email} · {pc.locations.length} location{pc.locations.length !== 1 ? "s" : ""} found</p>
            </div>

            {completed.has(pc.socialAccountId) ? (
              <div className="rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-center">
                <p className="text-sm text-success font-medium">Location assigned</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pc.locations.map((loc, index) => {
                  const sel = selections[pc.socialAccountId];
                  const isSelected = sel?.locationIndex === index;

                  return (
                    <div
                      key={loc.locationId}
                      className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                        isSelected ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
                      }`}
                      onClick={() => setSelections((prev) => ({
                        ...prev,
                        [pc.socialAccountId]: { siteId: "", locationIndex: index },
                      }))}
                    >
                      <p className="text-sm font-medium">{loc.locationName}</p>
                      {loc.address && (
                        <p className="mt-0.5 text-[10px] text-muted">{loc.address}</p>
                      )}

                      {isSelected && (
                        <div className="mt-3 flex items-center gap-2">
                          <select
                            value={sel?.siteId || ""}
                            onChange={(e) => setSelections((prev) => ({
                              ...prev,
                              [pc.socialAccountId]: { siteId: e.target.value, locationIndex: index },
                            }))}
                            className="flex-1 rounded border border-border bg-background px-3 py-1.5 text-xs"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <option value="">Assign to site...</option>
                            {sites.map((site) => (
                              <option key={site.id} value={site.id}>{site.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (sel?.siteId) {
                                assignLocation(pc.socialAccountId, sel.siteId, index);
                              }
                            }}
                            disabled={!sel?.siteId || saving === pc.socialAccountId}
                            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
                          >
                            {saving === pc.socialAccountId ? "Linking..." : "Link"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => router.push("/dashboard/accounts")}
            className={`rounded px-4 py-2 text-xs font-medium ${
              allDone
                ? "bg-accent text-white hover:bg-accent/90"
                : "text-muted hover:text-foreground"
            }`}
          >
            {allDone ? "Done" : "Skip for now"}
          </button>
        </div>
      </div>
    </div>
  );
}
