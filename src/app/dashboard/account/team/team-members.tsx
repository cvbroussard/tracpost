"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { PhoneField } from "@/components/phone-input";
import { confirm, toast } from "@/components/feedback";

interface Member {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  siteId: string | null;
  hasPassword: boolean;
  hasDevice: boolean;
  notifyVia: string;
  lastActiveAt: string | null;
  isOwner: boolean;
}

interface Site {
  id: string;
  name: string;
}

const ROLE_LABELS: Record<string, { label: string; description: string }> = {
  owner: { label: "Owner", description: "Full access plus billing, plan changes, and team management" },
  member: { label: "Member", description: "Full studio access — analytics, posts, sites, brand, connections" },
  capture: { label: "Capture", description: "Mobile app only — upload photos and videos" },
};

export function TeamMembers({
  members: initialMembers,
  sites,
  userLimit,
  subscriptionId,
}: {
  members: Member[];
  sites: Site[];
  userLimit: number;
  subscriptionId: string;
}) {
  const [members, setMembers] = useState(initialMembers);
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSiteId, setEditSiteId] = useState("");
  const [editNotifyVia, setEditNotifyVia] = useState("email");
  const [saving, setSaving] = useState(false);
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState("member");
  const [addSiteId, setAddSiteId] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(member: Member) {
    setEditing(member.id);
    setEditName(member.name);
    setEditEmail(member.email || "");
    setEditPhone(member.phone || "");
    setEditRole(member.role);
    setEditSiteId(member.siteId || "");
    setEditNotifyVia(member.notifyVia || "email");
    setQrUrl(null);
  }

  async function saveEdit(memberId: string) {
    setSaving(true);
    try {
      const res = await fetch(`/api/account/team/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim() || undefined,
          email: editEmail.trim() || undefined,
          phone: editPhone.trim() || undefined,
          role: editRole,
          siteId: editSiteId || null,
          notifyVia: editNotifyVia,
        }),
      });
      if (res.ok) {
        setMembers((prev) =>
          prev.map((m) =>
            m.id === memberId
              ? { ...m, name: editName.trim() || m.name, email: editEmail.trim() || m.email, phone: editPhone.trim() || m.phone, role: editRole, siteId: editSiteId || null, notifyVia: editNotifyVia }
              : m
          )
        );
        setEditing(null);
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function generateQr(memberId: string) {
    setQrLoading(true);
    try {
      const res = await fetch(`/api/account/team/${memberId}/magic-link`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setQrUrl(data.url);
      }
    } catch { /* ignore */ }
    setQrLoading(false);
  }

  async function addMember() {
    if (!addName.trim() || !addEmail.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/account/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          email: addEmail.trim(),
          role: addRole,
          siteId: addSiteId || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMembers((prev) => [...prev, {
          id: data.member.id,
          name: data.member.name,
          email: data.member.email,
          phone: null,
          role: data.member.role,
          siteId: data.member.siteId || null,
          hasPassword: false,
          hasDevice: false,
          notifyVia: "email",
          lastActiveAt: null,
          isOwner: false,
        }]);
        setShowAdd(false);
        setAddName("");
        setAddEmail("");
        setAddRole("member");
        setAddSiteId("");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to add member");
      }
    } catch {
      setError("Request failed");
    } finally {
      setAdding(false);
    }
  }

  async function removeMember(memberId: string) {
    if (!await confirm({ title: "Remove this team member?", body: "They will lose access.", confirmLabel: "Remove", danger: true })) return;
    try {
      const res = await fetch(`/api/account/team/${memberId}`, { method: "DELETE" });
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => m.id !== memberId));
      }
    } catch { /* ignore */ }
  }

  async function sendInvite(memberId: string, channel: "email" | "sms" | "both") {
    setSendingInvite(memberId);
    try {
      const res = await fetch(`/api/account/team/${memberId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      if (res.ok) {
        const data = await res.json();
        const parts = [];
        if (data.sent?.email) parts.push("email");
        if (data.sent?.sms) parts.push("SMS");
        parts.length > 0 ? toast.success(`Invite sent via ${parts.join(" + ")}`) : toast.warning("No contact info available");
      }
    } catch { /* ignore */ }
    setSendingInvite(null);
  }

  const canAdd = members.length < userLimit;

  return (
    <>
      {/* Member list */}
      <div className="space-y-1">
        {members.map((member) => (
          <div key={member.id} className="border-b border-border py-4 last:border-0">
            {/* Summary row */}
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{member.name}</p>
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[9px] font-medium text-accent">
                    {ROLE_LABELS[member.role]?.label || member.role}
                  </span>
                  {member.hasDevice && (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-[9px] text-success">mobile</span>
                  )}
                  {member.hasPassword && (
                    <span className="rounded-full bg-muted/10 px-2 py-0.5 text-[9px] text-muted">password</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-xs text-muted">{member.email || "No email"}</p>
                  <p className="text-[10px] text-dim">
                    {member.siteId
                      ? sites.find((s) => s.id === member.siteId)?.name || "Specific site"
                      : "All sites"}
                  </p>
                </div>
                {member.lastActiveAt && (
                  <p className="text-[10px] text-dim">
                    Last active {new Date(member.lastActiveAt).toLocaleDateString()}
                  </p>
                )}
              </div>

              {!member.isOwner && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => editing === member.id ? setEditing(null) : startEdit(member)}
                    className="text-[10px] text-muted hover:text-foreground"
                  >
                    {editing === member.id ? "Cancel" : "Edit"}
                  </button>
                  <button
                    onClick={() => removeMember(member.id)}
                    className="text-[10px] text-muted hover:text-danger"
                  >
                    Remove
                  </button>
                </div>
              )}

              {member.isOwner && (
                <span className="text-[10px] text-muted">All sites</span>
              )}
            </div>

            {/* Edit panel */}
            {editing === member.id && (
              <div className="mt-3 rounded border border-border bg-surface-hover p-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-muted">Name</label>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Email</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Phone</label>
                    <PhoneField
                      value={editPhone}
                      onChange={setEditPhone}
                      className="w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Role</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full text-sm"
                    >
                      <option value="member">Member — full studio access</option>
                      <option value="capture">Capture — mobile only</option>
                    </select>
                    <p className="mt-1 text-[10px] text-dim">
                      {ROLE_LABELS[editRole]?.description}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted">Site Access</label>
                    <select
                      value={editSiteId}
                      onChange={(e) => setEditSiteId(e.target.value)}
                      className="w-full text-sm"
                    >
                      <option value="">All sites</option>
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="mt-3 flex gap-3">
                  <button
                    onClick={() => saveEdit(member.id)}
                    disabled={saving}
                    className="bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="text-xs text-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>

                {/* Notifications + Invite */}
                <div className="mt-4 border-t border-border pt-4">
                  <div className="grid gap-4 sm:grid-cols-3">
                    {/* Notify preference */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">Default notifications</label>
                      <select
                        value={editNotifyVia}
                        onChange={(e) => setEditNotifyVia(e.target.value)}
                        className="w-full text-sm"
                      >
                        <option value="email">Email</option>
                        <option value="sms">SMS</option>
                        <option value="both">Email + SMS</option>
                      </select>
                    </div>

                    {/* Send invite */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">Send invite</label>
                      <div className="flex flex-wrap gap-2">
                        {member.email && (
                          <button
                            onClick={() => sendInvite(member.id, "email")}
                            disabled={sendingInvite === member.id}
                            className="border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
                          >
                            {sendingInvite === member.id ? "..." : "Email"}
                          </button>
                        )}
                        {member.phone && (
                          <button
                            onClick={() => sendInvite(member.id, "sms")}
                            disabled={sendingInvite === member.id}
                            className="border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
                          >
                            {sendingInvite === member.id ? "..." : "SMS"}
                          </button>
                        )}
                        {member.email && member.phone && (
                          <button
                            onClick={() => sendInvite(member.id, "both")}
                            disabled={sendingInvite === member.id}
                            className="border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
                          >
                            {sendingInvite === member.id ? "..." : "Both"}
                          </button>
                        )}
                        {!member.email && !member.phone && (
                          <p className="text-[10px] text-dim">Add email or phone first</p>
                        )}
                      </div>
                    </div>

                    {/* QR code */}
                    <div>
                      <label className="mb-1 block text-xs font-medium text-muted">QR Code</label>
                      {qrUrl ? (
                        <div className="flex items-start gap-3">
                          <div className="rounded border border-border bg-white p-2">
                            <QRCodeSVG value={qrUrl} size={80} level="M" />
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <button
                              onClick={() => navigator.clipboard.writeText(qrUrl)}
                              className="text-left text-[10px] text-accent hover:underline"
                            >
                              Copy link
                            </button>
                            <button
                              onClick={() => generateQr(member.id)}
                              className="text-left text-[10px] text-muted hover:text-foreground"
                            >
                              Regenerate
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => generateQr(member.id)}
                          disabled={qrLoading}
                          className="border border-border px-3 py-1.5 text-xs text-muted hover:text-foreground disabled:opacity-50"
                        >
                          {qrLoading ? "..." : "Generate"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add member */}
      {showAdd ? (
        <div className="mt-6 rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-4 text-sm font-medium">Add Team Member</h3>

          {error && <p className="mb-3 text-sm text-danger">{error}</p>}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-muted">Name</label>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="Full name"
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Email</label>
              <input
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Role</label>
              <select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value)}
                className="w-full text-sm"
              >
                <option value="member">Member — full studio access</option>
                <option value="capture">Capture — mobile only</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Site Access</label>
              <select
                value={addSiteId}
                onChange={(e) => setAddSiteId(e.target.value)}
                className="w-full text-sm"
              >
                <option value="">All sites</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={addMember}
              disabled={adding || !addName.trim() || !addEmail.trim()}
              className="bg-accent px-4 py-2 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {adding ? "Adding..." : "Add & Send Invite"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setError(null); }}
              className="text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : canAdd ? (
        <button
          onClick={() => setShowAdd(true)}
          className="mt-6 rounded border border-border px-4 py-2 text-xs text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          + Add Team Member
        </button>
      ) : (
        <p className="mt-6 text-xs text-muted">
          Team limit reached. Upgrade your plan to add more members.
        </p>
      )}
    </>
  );
}
