"use client";

import { useState } from "react";
import { PlatformIcon } from "@/components/platform-icons";
import { AccountName } from "./account-name";
import { DisconnectButton } from "./disconnect-button";
import { LinkedInOrgSelector } from "./linkedin-org-selector";

interface Account {
  id: string;
  platform: string;
  account_name: string;
  status: string;
  token_expires_at: string | null;
  published: number;
  scheduled: number;
  metadata: Record<string, unknown> | null;
}

export function AccountList({ accounts }: { accounts: Account[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (accounts.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="mb-2 text-3xl">◉</p>
        <h3>No accounts connected</h3>
        <p className="mt-1 text-muted">
          Connect a social account to start publishing content automatically.
        </p>
      </div>
    );
  }

  return (
    <div>
      {accounts.map((acc) => {
        const isOpen = expanded === acc.id;
        const expires = acc.token_expires_at ? new Date(acc.token_expires_at) : null;
        const daysLeft = expires ? Math.ceil((expires.getTime() - Date.now()) / 86400000) : null;
        const urgent = daysLeft !== null && daysLeft < 7;

        return (
          <div key={acc.id} className="border-b border-border last:border-0">
            {/* Row header — clickable */}
            <button
              onClick={() => setExpanded(isOpen ? null : acc.id)}
              className="flex w-full items-center justify-between py-3 text-left"
            >
              <div className="flex items-center gap-3">
                <PlatformIcon platform={acc.platform} size={18} />
                <span className="text-sm font-medium">{acc.platform}</span>
                <AccountName name={acc.account_name} />
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs ${acc.status === "active" ? "text-success" : "text-danger"}`}>
                  {acc.status}
                </span>
                {urgent && (
                  <span className="rounded bg-danger/10 px-1.5 py-0.5 text-[10px] text-danger">
                    {daysLeft}d
                  </span>
                )}
                <span className="text-xs text-muted">{isOpen ? "▾" : "▸"}</span>
              </div>
            </button>

            {/* Expanded pane */}
            {isOpen && (
              <div className="pb-4 pl-8">
                <div className="flex gap-6 text-sm">
                  <div>
                    <span className="font-semibold">{acc.published}</span>
                    <span className="ml-1 text-xs text-muted">published</span>
                  </div>
                  <div>
                    <span className="font-semibold">{acc.scheduled}</span>
                    <span className="ml-1 text-xs text-muted">scheduled</span>
                  </div>
                  <div>
                    <span className={`font-semibold ${urgent ? "text-danger" : ""}`}>
                      {daysLeft !== null ? `${daysLeft}d` : "—"}
                    </span>
                    <span className="ml-1 text-xs text-muted">token expires</span>
                  </div>
                </div>

                {/* LinkedIn org selector */}
                {acc.platform === "linkedin" && (() => {
                  const meta = acc.metadata || {};
                  const orgs = (meta.organizations || []) as Array<{ orgId: string; orgName: string; vanityName: string }>;
                  const selectedOrg = meta.selected_org as Record<string, string> | null;
                  if (orgs.length > 1) {
                    return (
                      <LinkedInOrgSelector
                        accountId={acc.id}
                        organizations={orgs}
                        selectedOrgId={selectedOrg?.org_id || null}
                      />
                    );
                  }
                  return null;
                })()}

                <div className="mt-3">
                  <DisconnectButton accountId={acc.id} accountName={acc.account_name} />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
