"use client";

import { useState } from "react";

interface Org {
  orgId: string;
  orgName: string;
  vanityName: string;
}

interface LinkedInOrgSelectorProps {
  accountId: string;
  organizations: Org[];
  selectedOrgId: string | null;
}

export function LinkedInOrgSelector({ accountId, organizations, selectedOrgId }: LinkedInOrgSelectorProps) {
  const [selected, setSelected] = useState(selectedOrgId);
  const [saving, setSaving] = useState(false);

  if (organizations.length <= 1) return null;

  async function handleSelect(orgId: string) {
    setSaving(true);
    const org = organizations.find((o) => o.orgId === orgId);
    if (!org) return;

    await fetch("/api/social-accounts/select-org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        orgId: org.orgId,
        orgName: org.orgName,
      }),
    });

    setSelected(orgId);
    setSaving(false);
  }

  return (
    <div className="mt-2">
      <p className="mb-1.5 text-xs text-muted">Select Company Page for publishing:</p>
      <div className="flex flex-wrap gap-2">
        {organizations.map((org) => (
          <button
            key={org.orgId}
            onClick={() => handleSelect(org.orgId)}
            disabled={saving}
            className={`rounded px-2.5 py-1 text-xs transition-colors ${
              selected === org.orgId
                ? "bg-accent/10 text-accent"
                : "bg-surface-hover text-muted hover:text-foreground"
            }`}
          >
            {org.orgName}
            {selected === org.orgId && " ✓"}
          </button>
        ))}
      </div>
    </div>
  );
}
