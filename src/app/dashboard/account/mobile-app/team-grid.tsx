"use client";

import { useState } from "react";
import { PhoneField } from "@/components/phone-input";

interface Member {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  siteId: string | null;
  inviteToken: string | null;
  inviteExpires: string | null;
  inviteConsumed: boolean;
  hasDevice: boolean;
  lastActiveAt: string | null;
  isActive: boolean;
}

// Editable state per member
interface EditState {
  name: string;
  phone: string;
  email: string;
  role: string;
  siteId: string;
}

interface Site {
  id: string;
  name: string;
}

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  owner: { label: "Owner", color: "bg-accent/10 text-accent" },
  engagement: { label: "Engagement", color: "bg-success/10 text-success" },
  capture: { label: "Capture", color: "bg-warning/10 text-warning" },
};

export function TeamGrid({
  members: initialMembers,
  sites,
  userLimit,
  activeCount,
  plan,
}: {
  members: Member[];
  sites: Site[];
  userLimit: number;
  activeCount: number;
  plan: string;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Add form state
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState("capture");
  const [newSiteId, setNewSiteId] = useState<string>("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newMethod, setNewMethod] = useState<"qr" | "sms" | "email">("sms");
  const [adding, setAdding] = useState(false);

  const canAdd = activeCount < userLimit && (plan === "pro" || plan === "authority");

  function toggleExpand(member: Member) {
    if (expanded === member.id) {
      setExpanded(null);
      setEditState(null);
    } else {
      setExpanded(member.id);
      setEditState({
        name: member.name,
        phone: member.phone || "",
        email: member.email || "",
        role: member.role,
        siteId: member.siteId || "",
      });
    }
  }

  async function saveEdit(id: string) {
    if (!editState) return;
    setEditSaving(true);

    // Save role + site scope
    await fetch(`/api/dashboard/team/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: editState.role,
        siteId: editState.siteId || null,
      }),
    });

    // Update local state
    setMembers((prev) =>
      prev.map((m) =>
        m.id === id
          ? { ...m, name: editState.name, phone: editState.phone || null, email: editState.email || null, role: editState.role, siteId: editState.siteId || null }
          : m
      )
    );
    setEditSaving(false);
  }

  async function handleAdd() {
    if (!newName || !newRole) return;
    setAdding(true);

    const res = await fetch("/api/dashboard/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName,
        role: newRole,
        siteId: newSiteId || null,
        phone: newPhone || null,
        email: newEmail || null,
        method: newMethod,
      }),
    });

    if (res.ok) {
      window.location.reload();
    } else {
      const data = await res.json();
      alert(data.error || "Failed to add member");
    }
    setAdding(false);
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/dashboard/team/${id}`, { method: "DELETE" });
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, isActive: false } : m)));
  }

  async function handleRevokeDevice(id: string) {
    await fetch(`/api/dashboard/team/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke-device" }),
    });
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, hasDevice: false } : m)));
  }

  async function handleRegenerate(id: string) {
    const res = await fetch(`/api/dashboard/team/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "regenerate" }),
    });
    if (res.ok) {
      const data = await res.json();
      setMembers((prev) =>
        prev.map((m) =>
          m.id === id
            ? { ...m, inviteToken: data.inviteToken, inviteExpires: data.inviteExpires, inviteConsumed: false }
            : m
        )
      );
    }
  }

  const activeMembers = members.filter((m) => m.isActive);
  const inactiveMembers = members.filter((m) => !m.isActive);

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <h2>Team</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted">{activeCount} of {userLimit} users</span>
          {canAdd && !showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="border border-border px-3 py-1 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
            >
              + Add User
            </button>
          )}
          {!canAdd && plan !== "pro" && plan !== "authority" && (
            <span className="text-[10px] text-muted">Upgrade for team access</span>
          )}
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="mb-6">
          <h3 className="mb-4 text-sm font-medium">Invite Team Member</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Name *</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="John"
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Role *</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                className="w-full text-sm"
              >
                <option value="capture">Capture — photos/videos only</option>
                <option value="engagement">Engagement — inbox + activity</option>
              </select>
            </div>
            {sites.length > 1 && (
              <div>
                <label className="mb-1 block text-xs text-muted">Site Access</label>
                <select
                  value={newSiteId}
                  onChange={(e) => setNewSiteId(e.target.value)}
                  className="w-full text-sm"
                >
                  <option value="">All Sites</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-muted">Invite via</label>
              <div className="flex gap-2">
                {(["sms", "qr", "email"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setNewMethod(m)}
                    className={`flex-1 py-2 text-xs font-medium ${
                      newMethod === m
                        ? "bg-accent/10 text-accent"
                        : "bg-surface-hover text-muted"
                    }`}
                  >
                    {m === "sms" ? "SMS" : m === "qr" ? "QR Code" : "Email"}
                  </button>
                ))}
              </div>
            </div>
            {newMethod === "sms" && (
              <div>
                <label className="mb-1 block text-xs text-muted">Phone *</label>
                <PhoneField
                  value={newPhone}
                  onChange={setNewPhone}
                  className="w-full text-sm"
                />
              </div>
            )}
            {newMethod === "email" && (
              <div>
                <label className="mb-1 block text-xs text-muted">Email *</label>
                <input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full text-sm"
                  type="email"
                />
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-3">
            <button
              onClick={handleAdd}
              disabled={adding || !newName}
              className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {adding ? "Creating..." : "Create Invite"}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Active members */}
      {activeMembers.length > 0 ? (
        <div>
          {activeMembers.map((member) => {
            const isOpen = expanded === member.id;
            const roleInfo = ROLE_LABELS[member.role] || ROLE_LABELS.capture;
            const siteName = member.siteId
              ? sites.find((s) => s.id === member.siteId)?.name || "Unknown"
              : "All Sites";

            const status = member.hasDevice
              ? "Active"
              : member.inviteConsumed
                ? "No device"
                : "Invited";

            return (
              <div key={member.id} className="border-b border-border last:border-0">
                <button
                  onClick={() => toggleExpand(member)}
                  className="flex w-full items-center justify-between py-3 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{member.name}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${roleInfo.color}`}>
                      {roleInfo.label}
                    </span>
                    {sites.length > 1 && (
                      <span className="text-[10px] text-muted">{siteName}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${member.hasDevice ? "text-success" : "text-muted"}`}>
                      {status}
                    </span>
                    {member.lastActiveAt && (
                      <span className="text-[10px] text-dim">
                        {timeAgo(member.lastActiveAt)}
                      </span>
                    )}
                    <span className="text-xs text-muted">{isOpen ? "▾" : "▸"}</span>
                  </div>
                </button>

                {isOpen && editState && (
                  <div className="pb-4">
                    <div className="flex gap-6">
                      {/* Left: editable fields */}
                      <div className="flex-1 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[10px] text-muted">Name</label>
                            <input
                              value={editState.name}
                              onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                              className="w-full text-sm"
                              disabled={member.role === "owner"}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] text-muted">Role</label>
                            <select
                              value={editState.role}
                              onChange={(e) => setEditState({ ...editState, role: e.target.value })}
                              className="w-full text-sm"
                              disabled={member.role === "owner"}
                            >
                              <option value="owner" disabled>Owner</option>
                              <option value="capture">Capture</option>
                              <option value="engagement">Engagement</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] text-muted">Phone</label>
                            <PhoneField
                              value={editState.phone}
                              onChange={(v) => setEditState({ ...editState, phone: v })}
                              className="w-full text-sm"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[10px] text-muted">Email</label>
                            <input
                              value={editState.email}
                              onChange={(e) => setEditState({ ...editState, email: e.target.value })}
                              placeholder="john@example.com"
                              className="w-full text-sm"
                              type="email"
                            />
                          </div>
                          {sites.length > 1 && (
                            <div>
                              <label className="mb-1 block text-[10px] text-muted">Site Access</label>
                              <select
                                value={editState.siteId}
                                onChange={(e) => setEditState({ ...editState, siteId: e.target.value })}
                                className="w-full text-sm"
                                disabled={member.role === "owner"}
                              >
                                <option value="">All Sites</option>
                                {sites.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        {/* Device status + actions */}
                        <div className="flex items-center gap-3 text-xs">
                          {member.hasDevice ? (
                            <>
                              <span className="text-success">Device connected</span>
                              {member.lastActiveAt && (
                                <span className="text-muted" suppressHydrationWarning>Active {timeAgo(member.lastActiveAt)}</span>
                              )}
                              <button
                                onClick={() => handleRevokeDevice(member.id)}
                                className="text-muted hover:text-danger"
                              >
                                Revoke device
                              </button>
                            </>
                          ) : member.inviteConsumed ? (
                            <span className="text-muted">
                              No device connected ·{" "}
                              <button onClick={() => handleRegenerate(member.id)} className="text-accent hover:underline">
                                Resend invite
                              </button>
                            </span>
                          ) : (
                            <span className="text-muted">Invite pending</span>
                          )}
                        </div>

                        {/* Save + Remove */}
                        <div className="flex items-center gap-3">
                          {member.role !== "owner" && (
                            <button
                              onClick={() => saveEdit(member.id)}
                              disabled={editSaving}
                              className="bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                            >
                              {editSaving ? "Saving..." : "Save"}
                            </button>
                          )}
                          {member.role !== "owner" && (
                            <button
                              onClick={() => handleRevoke(member.id)}
                              className="text-xs text-danger hover:underline"
                            >
                              Remove user
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Right: QR code */}
                      {member.inviteToken && !member.inviteConsumed && (
                        <div className="shrink-0">
                          <div
                            className="flex flex-col items-center border border-border p-3"
                            style={{ background: "#fff", borderRadius: "var(--tp-radius)" }}
                          >
                            <div
                              style={{
                                width: 100,
                                height: 100,
                                background: "#f3f4f6",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: 4,
                                fontSize: 10,
                                color: "#6b7280",
                              }}
                            >
                              QR Code
                            </div>
                          </div>
                          {member.inviteExpires && (
                            <p className="mt-1 text-center text-[10px] text-dim" suppressHydrationWarning>
                              Expires {timeAgo(member.inviteExpires)}
                            </p>
                          )}
                          <div className="mt-2 flex justify-center gap-2">
                            <button
                              onClick={() => navigator.clipboard.writeText(`https://tracpost.com/invite/${member.inviteToken}`)}
                              className="text-[10px] text-accent hover:underline"
                            >
                              Copy link
                            </button>
                            <button
                              onClick={() => handleRegenerate(member.id)}
                              className="text-[10px] text-muted hover:text-foreground"
                            >
                              Regenerate
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted">
          {plan === "pro" || plan === "authority"
            ? "No team members yet. Add your first user to get started."
            : "Upgrade to add team members."}
        </p>
      )}

      {/* Inactive members */}
      {inactiveMembers.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-muted">Removed</p>
          {inactiveMembers.map((m) => (
            <div key={m.id} className="flex items-baseline justify-between border-b border-border py-2 opacity-40">
              <span className="text-sm">{m.name}</span>
              <span className="text-[10px] text-muted">{m.role}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
