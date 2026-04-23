"use client";

import { useState, useEffect } from "react";

interface Kiosk {
  id: string;
  name: string;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
  url?: string;
  kiosk_token?: string;
}

export default function KiosksPage() {
  const [kiosks, setKiosks] = useState<Kiosk[]>([]);
  const [name, setName] = useState("");
  const [googlePlaceId, setGooglePlaceId] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKioskUrl, setNewKioskUrl] = useState<string | null>(null);

  useEffect(() => {
    fetchKiosks();
  }, []);

  async function fetchKiosks() {
    const res = await fetch("/api/spotlight/kiosks?site_id=active");
    if (res.ok) {
      const data = await res.json();
      setKiosks(data.kiosks || []);
    }
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);

    const res = await fetch("/api/spotlight/kiosks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        site_id: "active",
        name: name.trim(),
        settings: googlePlaceId ? { google_place_id: googlePlaceId } : {},
      }),
    });

    if (res.ok) {
      const data = await res.json();
      setNewKioskUrl(data.kiosk.url);
      setName("");
      setGooglePlaceId("");
      fetchKiosks();
    }
    setCreating(false);
  }

  async function handleDeactivate(id: string) {
    await fetch(`/api/spotlight/kiosks/${id}`, { method: "DELETE" });
    fetchKiosks();
  }

  return (
    <div className="p-4 space-y-6 max-w-2xl">
      <div>
        <h1>Kiosk Devices</h1>
        <p className="mt-1 text-muted">Register iPad devices for Spotlight capture at your counter.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
        <h3 className="mb-3 text-sm font-medium">Register New Kiosk</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Device name (e.g., Front Counter iPad)"
          className="mb-3 w-full rounded border border-border bg-background p-2 text-sm focus:border-accent focus:outline-none"
        />
        <input
          type="text"
          value={googlePlaceId}
          onChange={(e) => setGooglePlaceId(e.target.value)}
          placeholder="Google Place ID (for review deep links)"
          className="mb-3 w-full rounded border border-border bg-background p-2 text-sm focus:border-accent focus:outline-none"
        />
        <button
          onClick={handleCreate}
          disabled={!name.trim() || creating}
          className="rounded bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {creating ? "Creating..." : "Register Kiosk"}
        </button>
      </div>

      {newKioskUrl && (
        <div className="rounded-xl border border-green-600 bg-green-600/10 p-4">
          <p className="text-sm font-medium text-green-400">Kiosk registered!</p>
          <p className="mt-1 text-xs text-muted">Open this URL on your iPad and add to Home Screen:</p>
          <p className="mt-2 break-all rounded bg-surface p-2 text-xs font-mono">{newKioskUrl}</p>
        </div>
      )}

      {kiosks.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 shadow-card">
          <h3 className="mb-3 text-sm font-medium">Registered Kiosks</h3>
          {kiosks.map((kiosk) => (
            <div key={kiosk.id} className="flex items-center justify-between border-b border-border py-3 last:border-0">
              <div>
                <p className="text-sm">{kiosk.name}</p>
                <p className="text-xs text-muted">
                  {kiosk.last_seen_at
                    ? `Last seen ${new Date(kiosk.last_seen_at).toLocaleString()}`
                    : "Never connected"}
                </p>
              </div>
              <button
                onClick={() => handleDeactivate(kiosk.id)}
                className="text-xs text-red-400 hover:text-red-300"
              >
                Deactivate
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
