"use client";

import { useState, type ReactNode } from "react";

export interface Membership {
  id: string;
  scope_type: "platform" | "operator" | "account" | "business";
  role: "admin" | "member";
  capability: string | null; // function axis — full|capture|reviewer (business scope only)
  scope_id: string | null;
  scope_name: string | null;
}

const CAPABILITIES = ["full", "capture", "reviewer"];

export interface BizOption {
  id: string;
  name: string;
}

export interface UserRow {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  isActive: boolean;
  createdAt: string;
  billingAccountId: string | null;
  accountName: string | null;
  businessId: string | null;
  businessName: string | null;
  memberships: Membership[];
  accountBusinesses: BizOption[];
}

const SCOPE_BADGE: Record<Membership["scope_type"], string> = {
  platform: "border-red-200 bg-red-100 text-red-700",
  operator: "border-amber-200 bg-amber-100 text-amber-700",
  account: "border-blue-200 bg-blue-100 text-blue-700",
  business: "border-emerald-200 bg-emerald-100 text-emerald-700",
};

const selectCls = "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm";
const inputCls = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm";

export function UsersClient({ initialRows }: { initialRows: UserRow[] }) {
  const [rows, setRows] = useState<UserRow[]>(initialRows);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const patch = (id: string, fn: (u: UserRow) => UserRow) =>
    setRows((prev) => prev.map((u) => (u.id === id ? fn(u) : u)));

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function post(url: string, method: string, body?: unknown) {
    const res = await fetch(url, {
      method,
      ...(body !== undefined
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
        : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
    return data;
  }

  function toggleActive(u: UserRow) {
    return run(u.id + ":active", async () => {
      await post(`/api/admin/users/${u.id}`, "PATCH", { is_active: !u.isActive });
      patch(u.id, (x) => ({ ...x, isActive: !u.isActive }));
    });
  }

  function removeMembership(u: UserRow, m: Membership) {
    return run(u.id + ":m:" + m.id, async () => {
      await post(`/api/admin/users/${u.id}/memberships?membership_id=${m.id}`, "DELETE");
      patch(u.id, (x) => ({ ...x, memberships: x.memberships.filter((mm) => mm.id !== m.id) }));
    });
  }

  function addMembership(
    u: UserRow,
    scopeType: Membership["scope_type"],
    role: Membership["role"],
    scopeId: string | null,
    capability: string | null,
  ) {
    return run(u.id + ":add", async () => {
      const data = await post(`/api/admin/users/${u.id}/memberships`, "POST", {
        scope_type: scopeType,
        role,
        scope_id: scopeId,
        capability,
      });
      patch(u.id, (x) => ({ ...x, memberships: [...x.memberships, data.membership as Membership] }));
    });
  }

  function setCapability(u: UserRow, m: Membership, capability: string) {
    return run(u.id + ":cap:" + m.id, async () => {
      await post(`/api/admin/users/${u.id}/memberships`, "PATCH", {
        membership_id: m.id,
        capability,
      });
      patch(u.id, (x) => ({
        ...x,
        memberships: x.memberships.map((mm) => (mm.id === m.id ? { ...mm, capability } : mm)),
      }));
    });
  }

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter((u) =>
        [u.name, u.email, u.accountName, u.businessName, u.role].some((v) =>
          (v || "").toLowerCase().includes(q),
        ),
      )
    : rows;

  return (
    <>
      <div className="mb-4 flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, account, business, or role…"
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm"
        />
        <span className="whitespace-nowrap text-sm text-muted">
          {filtered.length} / {rows.length}
        </span>
        <button
          onClick={() => setShowCreate(true)}
          className="whitespace-nowrap rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          Add user
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((u) => (
          <UserCard
            key={u.id}
            u={u}
            busy={busy}
            onToggleActive={() => toggleActive(u)}
            onRemoveMembership={(m) => removeMembership(u, m)}
            onAddMembership={(st, role, sid, cap) => addMembership(u, st, role, sid, cap)}
            onSetCapability={(m, cap) => setCapability(u, m, cap)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-10 text-center text-sm text-muted">
            No users match.
          </div>
        )}
      </div>

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={(u) => {
            setRows((prev) => [u, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
    </>
  );
}

function UserCard({
  u,
  busy,
  onToggleActive,
  onRemoveMembership,
  onAddMembership,
  onSetCapability,
}: {
  u: UserRow;
  busy: string | null;
  onToggleActive: () => void;
  onRemoveMembership: (m: Membership) => void;
  onAddMembership: (
    scopeType: Membership["scope_type"],
    role: Membership["role"],
    scopeId: string | null,
    capability: string | null,
  ) => void;
  onSetCapability: (m: Membership, capability: string) => void;
}) {
  const hasBiz = u.accountBusinesses.length > 0;
  // Default to a viable scope: `business` only when the account actually has a
  // business to attach to (otherwise Add would be disabled with no recourse —
  // the case for accountless staff and empty accounts).
  const [scopeType, setScopeType] = useState<Membership["scope_type"]>(hasBiz ? "business" : "operator");
  const [role, setRole] = useState<Membership["role"]>("member");
  const [bizScope, setBizScope] = useState<string>(u.accountBusinesses[0]?.id || "");
  const [addCapability, setAddCapability] = useState<string>("full");

  const needsBiz = scopeType === "business";
  const needsAccount = scopeType === "account";

  function submitAdd() {
    let scopeId: string | null = null;
    if (needsBiz) scopeId = bizScope || null;
    else if (needsAccount) scopeId = u.billingAccountId;
    onAddMembership(scopeType, role, scopeId, needsBiz ? addCapability : null);
  }

  return (
    <div className="rounded-xl border border-border bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-foreground">{u.name || "(no name)"}</span>
            {u.role && (
              <span
                title="Legacy users.role — transitional, NOT the access authority. Scope + tier live on memberships; function (full/capture/reviewer) is moving to memberships too."
                className="rounded bg-surface-hover px-2 py-0.5 text-xs text-muted"
              >
                legacy role: {u.role}
              </span>
            )}
            <span className={`text-xs ${u.isActive ? "text-success" : "text-danger"}`}>
              {u.isActive ? "active" : "inactive"}
            </span>
          </div>
          <div className="mt-0.5 text-sm text-muted">{u.email || "—"}</div>
          <div className="mt-0.5 text-xs text-muted">
            Account: {u.accountName || "—"}
            <span title="Legacy users.business_id — read-only here; manage business assignment via a business membership. Slated for retirement with users.role.">
              {" · legacy business_id: "}
              {u.businessName || "—"}
            </span>
          </div>
        </div>
        <button
          onClick={onToggleActive}
          disabled={busy === u.id + ":active"}
          className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-surface-hover disabled:opacity-50"
        >
          {u.isActive ? "Deactivate" : "Activate"}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {u.memberships.length === 0 && (
          <span className="text-xs text-muted">No memberships (resolves to Guest)</span>
        )}
        {u.memberships.map((m) => (
          <span
            key={m.id}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${SCOPE_BADGE[m.scope_type] || "border-border"}`}
          >
            {m.scope_type}:{m.role}
            {m.scope_name ? ` · ${m.scope_name}` : ""}
            {m.scope_type === "business" && (
              <select
                value={m.capability || "full"}
                onChange={(e) => onSetCapability(m, e.target.value)}
                disabled={busy === u.id + ":cap:" + m.id}
                title="Capability (function): full / capture / reviewer"
                className="ml-1 rounded border border-border bg-surface px-1 py-0 text-[11px] text-foreground"
              >
                {CAPABILITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => onRemoveMembership(m)}
              disabled={busy === u.id + ":m:" + m.id}
              className="ml-1 opacity-60 hover:opacity-100 disabled:opacity-30"
              aria-label="Remove membership"
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-4 border-t border-border pt-3">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Add membership">
            <select
              value={scopeType}
              onChange={(e) => setScopeType(e.target.value as Membership["scope_type"])}
              className={selectCls}
            >
              <option value="platform">platform</option>
              <option value="operator">operator</option>
              <option value="account" disabled={!u.billingAccountId}>
                account (agency){u.billingAccountId ? "" : " — no account"}
              </option>
              <option value="business" disabled={!hasBiz}>
                business{hasBiz ? "" : " — none in account"}
              </option>
            </select>
          </Field>
          <Field label="role">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Membership["role"])}
              className={selectCls}
            >
              <option value="admin">admin</option>
              <option value="member">member</option>
            </select>
          </Field>
          {needsBiz && (
            <Field label="business">
              <select value={bizScope} onChange={(e) => setBizScope(e.target.value)} className={selectCls}>
                {u.accountBusinesses.length === 0 && <option value="">(none in account)</option>}
                {u.accountBusinesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {needsBiz && (
            <Field label="capability">
              <select value={addCapability} onChange={(e) => setAddCapability(e.target.value)} className={selectCls}>
                {CAPABILITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {needsAccount && (
            <span className="pb-1.5 text-xs text-muted">→ {u.accountName || u.billingAccountId || "this account"}</span>
          )}
          <button
            onClick={submitAdd}
            disabled={
              busy === u.id + ":add" ||
              (needsBiz && !bizScope) ||
              (needsAccount && !u.billingAccountId)
            }
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (u: UserRow) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      onCreated(data.user as UserRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold">Add user</h2>
        <p className="mb-4 text-sm text-muted">
          Creates an accountless staff user with no memberships. Grant access from the user card
          after creating. Customer team members come through onboarding, not here.
        </p>
        <div className="space-y-3">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              className={inputCls}
              placeholder="staff@tracpost.com"
            />
          </Field>
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputCls}
              placeholder="Full name (defaults to email)"
            />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputCls} pr-10`}
                placeholder="At least 8 characters"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </Field>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:bg-surface-hover disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !email || password.length < 8}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create user"}
          </button>
        </div>
      </div>
    </div>
  );
}
