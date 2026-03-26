"use client";

import { useState } from "react";
import Link from "next/link";

export interface ChecklistState {
  connectedPlatforms: string[];
  allPlatforms: string[];
  existingAccounts: string[];
  hasPlaybook: boolean;
  isPlaybookRefined: boolean;
  assetCount: number;
  blogEnabled: boolean;
  autopilotActive: boolean;
  provisioningStatus: string | null;
}

const REQUIRED_ASSETS = 5;

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  gbp: "Google Business",
  youtube: "YouTube",
  twitter: "X (Twitter)",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
};

export function OnboardingChecklist({ state, prefix, defaultCollapsed = false }: { state: ChecklistState; prefix: string; defaultCollapsed?: boolean }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [appDismissed, setAppDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("tp-app-installed") === "true";
  });

  const isProvisioning = state.provisioningStatus === "requested" || state.provisioningStatus === "in_progress";
  const isProvisioned = state.provisioningStatus === "complete";

  // Existing accounts the subscriber needs to connect
  const existingNotConnected = state.existingAccounts.filter(
    (p) => !state.connectedPlatforms.includes(p)
  );

  // Platforms being created by platform (not in existingAccounts)
  const platformCreating = state.allPlatforms.filter(
    (p) => !state.existingAccounts.includes(p) && !state.connectedPlatforms.includes(p)
  );

  // Build steps based on provisioning state
  const steps: Step[] = [];

  // Step: Platform provisioning (behind the curtain)
  if (isProvisioning) {
    steps.push({
      key: "provisioning",
      label: state.provisioningStatus === "requested"
        ? "Setting up your site"
        : "Provisioning in progress",
      done: false,
      detail: "Our team is configuring your social accounts and brand profile",
      href: null,
      isCurtain: true,
    });
  } else if (!isProvisioned && state.provisioningStatus === null) {
    // No provisioning started — shouldn't normally happen
    steps.push({
      key: "provisioning",
      label: "Site setup pending",
      done: false,
      detail: "Your site is being prepared",
      href: null,
      isCurtain: true,
    });
  }

  // Step: Connect your existing accounts (subscriber action)
  if (state.existingAccounts.length > 0) {
    const allExistingConnected = existingNotConnected.length === 0;
    steps.push({
      key: "connect-existing",
      label: "Connect your accounts",
      done: allExistingConnected,
      detail: allExistingConnected
        ? `${state.existingAccounts.length} account${state.existingAccounts.length !== 1 ? "s" : ""} connected`
        : `${existingNotConnected.length} account${existingNotConnected.length !== 1 ? "s" : ""} to connect`,
      href: `${prefix}/accounts`,
      missing: existingNotConnected,
    });
  }

  // Step: Capture content
  steps.push({
    key: "assets",
    label: `Capture ${REQUIRED_ASSETS}+ content assets`,
    done: state.assetCount >= REQUIRED_ASSETS,
    detail: state.assetCount >= REQUIRED_ASSETS
      ? `${state.assetCount} assets ready`
      : `${state.assetCount} of ${REQUIRED_ASSETS}`,
    href: `${prefix}/capture`,
  });

  // Step: Get the app
  const hasApp = appDismissed || state.assetCount > 0;
  steps.push({
    key: "app",
    label: "Get TracPost Studio",
    done: hasApp,
    detail: hasApp ? "App installed" : "Capture content from your phone",
    href: null,
    isApp: true,
  });

  // Sharpen playbook — subscriber action, only if baseline exists but not yet refined
  if (state.hasPlaybook && !state.isPlaybookRefined) {
    steps.push({
      key: "sharpen",
      label: "Sharpen your playbook",
      done: false,
      detail: "Tell us what makes you different",
      href: `${prefix}/brand`,
    });
  }

  // Behind-the-curtain items (informational, not subscriber actions)
  const curtainItems: { label: string; done: boolean }[] = [];

  if (isProvisioned || isProvisioning) {
    curtainItems.push({ label: "Baseline playbook", done: state.hasPlaybook });

    if (state.hasPlaybook) {
      curtainItems.push({ label: "Sharpened playbook", done: state.isPlaybookRefined });
    }

    curtainItems.push({ label: "Blog", done: state.blogEnabled });

    if (platformCreating.length > 0) {
      const platformConnected = platformCreating.filter((p) => state.connectedPlatforms.includes(p));
      curtainItems.push({
        label: `New accounts (${platformConnected.length}/${platformCreating.length})`,
        done: platformConnected.length === platformCreating.length,
      });
    }
  }

  const subscriberSteps = steps.filter((s) => !s.isCurtain);
  const completedCount = subscriberSteps.filter((s) => s.done).length;
  const totalSteps = subscriberSteps.length;
  const allDone = completedCount === totalSteps && isProvisioned;

  return (
    <>
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full border-b border-border px-5 py-4 text-left"
      >
        <div className="flex items-center justify-between">
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
            {allDone ? "Ready to launch" : "Setup Progress"}
          </h3>
          <span className="text-xs text-muted">{collapsed ? "▸" : "▾"}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <div
              className={`h-full transition-all ${allDone ? "bg-success" : "bg-accent"}`}
              style={{ width: `${totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0}%` }}
            />
          </div>
          <span style={{ fontSize: 13 }} className="text-muted">
            {completedCount}/{totalSteps}
          </span>
        </div>
      </button>

      {!collapsed && (
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Provisioning status (curtain) */}
        {isProvisioning && (
          <div className="mb-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" />
              <div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>
                  {state.provisioningStatus === "requested" ? "Setting up your site" : "Provisioning in progress"}
                </p>
                <p style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 2 }}>
                  Our team is configuring your accounts and brand profile
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Subscriber action steps */}
        {subscriberSteps.map((step) => (
          <div key={step.key} className="mb-4">
            {"isApp" in step && step.isApp && !step.done ? (
              <AppStep onDismiss={() => {
                setAppDismissed(true);
                localStorage.setItem("tp-app-installed", "true");
              }} />
            ) : (
              <Link
                href={step.href || "#"}
                className="flex items-start gap-3"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <StepIcon done={step.done} />
                <div className="min-w-0 flex-1">
                  <p style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: step.done ? "var(--color-muted)" : "var(--color-foreground)",
                    textDecoration: step.done ? "line-through" : "none",
                  }}>
                    {step.label}
                  </p>
                  <p style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 2 }}>
                    {step.detail}
                  </p>
                </div>
              </Link>
            )}

            {/* Missing platforms */}
            {"missing" in step && step.missing && step.missing.length > 0 && !step.done && (
              <div style={{ marginLeft: 32, marginTop: 6 }}>
                {step.missing.map((platform) => (
                  <div key={platform} style={{
                    fontSize: 13, color: "var(--color-muted)", padding: "3px 0",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-warning)", flexShrink: 0 }} />
                    {PLATFORM_LABELS[platform] || platform}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Behind the curtain — platform progress */}
        {curtainItems.length > 0 && (
          <div style={{
            marginTop: 12,
            padding: 12,
            borderRadius: "var(--tp-radius)",
            background: "var(--color-surface-hover)",
          }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-muted)", marginBottom: 8 }}>
              Handled for you
            </p>
            {curtainItems.map((item) => (
              <div key={item.label} style={{
                display: "flex", alignItems: "center", gap: 8,
                fontSize: 13, color: "var(--color-muted)", padding: "2px 0",
              }}>
                <span style={{
                  width: 14, height: 14, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 9, fontWeight: 600,
                  background: item.done ? "var(--color-success)" : "var(--color-surface-hover)",
                  color: item.done ? "#fff" : "var(--color-muted)",
                  border: item.done ? "none" : "1px solid var(--color-border)",
                }}>
                  {item.done ? "✓" : ""}
                </span>
                {item.label}
              </div>
            ))}
          </div>
        )}

        {/* Autopilot status */}
        <div style={{
          marginTop: 16, padding: 12, borderRadius: "var(--tp-radius)",
          background: allDone ? "rgba(34, 197, 94, 0.1)" : "var(--color-surface-hover)",
        }}>
          {allDone ? (
            <>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-success)" }}>
                Autopilot is ready
              </p>
              <p style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 4 }}>
                Your content engine will begin publishing automatically.
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 14, fontWeight: 500 }}>
                Autopilot activates when setup is complete
              </p>
              <p style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 4 }}>
                {totalSteps - completedCount} step{totalSteps - completedCount !== 1 ? "s" : ""} remaining
              </p>
            </>
          )}
        </div>
      </div>
      )}
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────

interface Step {
  key: string;
  label: string;
  done: boolean;
  detail: string;
  href: string | null;
  isCurtain?: boolean;
  isApp?: boolean;
  missing?: string[];
}

function StepIcon({ done }: { done: boolean }) {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: "50%",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 11, fontWeight: 600, flexShrink: 0, marginTop: 2,
      background: done ? "var(--color-success)" : "var(--color-surface-hover)",
      color: done ? "#fff" : "var(--color-muted)",
    }}>
      {done ? "✓" : ""}
    </span>
  );
}

function AppStep({ onDismiss }: { onDismiss: () => void }) {
  const [showQR, setShowQR] = useState(false);

  return (
    <div className="flex items-start gap-3">
      <StepIcon done={false} />
      <div className="min-w-0 flex-1">
        <p style={{ fontSize: 14, fontWeight: 500 }}>Get TracPost Studio</p>
        <p style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 2 }}>
          Capture content from your phone
        </p>
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={() => setShowQR(!showQR)}
            style={{
              fontSize: 13, fontWeight: 500, padding: "6px 12px",
              background: "var(--color-accent)", color: "#fff",
              border: "none", cursor: "pointer", textAlign: "left",
            }}
          >
            {showQR ? "Hide QR Code" : "Download for iPhone"}
          </button>
          {showQR && (
            <div style={{
              padding: 12, background: "#fff",
              borderRadius: "var(--tp-radius)", textAlign: "center",
            }}>
              <div style={{
                width: 120, height: 120, margin: "0 auto 8px",
                background: "#f3f4f6", display: "flex", alignItems: "center",
                justifyContent: "center", borderRadius: 4, fontSize: 11, color: "#6b7280",
              }}>
                QR Code
              </div>
            </div>
          )}
          <button
            onClick={onDismiss}
            style={{
              fontSize: 12, color: "var(--color-muted)",
              background: "none", border: "none", cursor: "pointer",
              textAlign: "left", padding: 0,
            }}
          >
            I&apos;ve installed it →
          </button>
        </div>
      </div>
    </div>
  );
}
