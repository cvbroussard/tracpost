"use client";

import { useState } from "react";
import Link from "next/link";

export interface ChecklistState {
  connectedPlatforms: string[];
  allPlatforms: string[];
  hasPlaybook: boolean;
  assetCount: number;
  blogEnabled: boolean;
  autopilotActive: boolean;
}

const REQUIRED_ASSETS = 5;

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  facebook: "Facebook",
  gbp: "Google Business",
  youtube: "YouTube",
  twitter: "Twitter / X",
  linkedin: "LinkedIn",
  pinterest: "Pinterest",
};

// TODO: Replace with actual App Store URL once published
const APP_STORE_URL = "https://testflight.apple.com/join/tracpost";

export function OnboardingChecklist({ state, prefix }: { state: ChecklistState; prefix: string }) {
  const [showQR, setShowQR] = useState(false);
  const [appDismissed, setAppDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("tp-app-installed") === "true";
  });

  const missingPlatforms = state.allPlatforms.filter(
    (p) => !state.connectedPlatforms.includes(p)
  );

  function markAppInstalled() {
    setAppDismissed(true);
    localStorage.setItem("tp-app-installed", "true");
  }

  const steps = [
    {
      key: "app",
      label: "Get TracPost Studio",
      done: appDismissed || state.assetCount > 0, // If they've uploaded assets, they have the app or don't need it
      detail: appDismissed || state.assetCount > 0
        ? "App installed"
        : "Capture content from your phone",
      href: null, // Special handling — not a page link
      isApp: true,
    },
    {
      key: "platforms",
      label: "Connect 3+ social platforms",
      done: state.connectedPlatforms.length >= 3,
      detail: state.connectedPlatforms.length >= 3
        ? `${state.connectedPlatforms.length} platforms connected`
        : `${state.connectedPlatforms.length} of 3 minimum`,
      href: `${prefix}/accounts`,
      missing: state.connectedPlatforms.length < 3 ? missingPlatforms.slice(0, 5) : [],
    },
    {
      key: "assets",
      label: `Capture ${REQUIRED_ASSETS}+ content assets`,
      done: state.assetCount >= REQUIRED_ASSETS,
      detail: state.assetCount >= REQUIRED_ASSETS
        ? `${state.assetCount} assets ready`
        : `${state.assetCount} of ${REQUIRED_ASSETS} — use the app or upload here`,
      href: `${prefix}/capture`,
    },
    {
      key: "blog",
      label: "Enable your blog",
      done: state.blogEnabled,
      detail: state.blogEnabled
        ? "Blog is live"
        : "Your SEO engine",
      href: `${prefix}/blog`,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  if (allDone && state.autopilotActive) {
    return null;
  }

  return (
    <div className="flex h-full w-72 flex-col border-l border-border bg-surface">
      <div className="border-b border-border px-5 py-4">
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
          {allDone ? "Ready to launch" : "Setup Progress"}
        </h3>
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${(completedCount / steps.length) * 100}%` }}
            />
          </div>
          <span style={{ fontSize: 13 }} className="text-muted">
            {completedCount}/{steps.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {steps.map((step) => (
          <div key={step.key} className="mb-4">
            {/* App step — special rendering */}
            {"isApp" in step && step.isApp && !step.done ? (
              <div>
                <div className="flex items-start gap-3">
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 600,
                      flexShrink: 0,
                      marginTop: 2,
                      background: "var(--color-accent)",
                      color: "#fff",
                    }}
                  >
                    1
                  </span>
                  <div className="min-w-0 flex-1">
                    <p style={{ fontSize: 14, fontWeight: 500 }}>
                      {step.label}
                    </p>
                    <p style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 2 }}>
                      {step.detail}
                    </p>

                    {/* App install actions */}
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      <button
                        onClick={() => setShowQR(!showQR)}
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          padding: "6px 12px",
                          background: "var(--color-accent)",
                          color: "#fff",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {showQR ? "Hide QR Code" : "Download for iPhone"}
                      </button>

                      {showQR && (
                        <div style={{
                          padding: 12,
                          background: "#fff",
                          borderRadius: "var(--tp-radius)",
                          textAlign: "center",
                        }}>
                          {/* QR code placeholder — replace with actual QR image */}
                          <div style={{
                            width: 120,
                            height: 120,
                            margin: "0 auto 8px",
                            background: "#f3f4f6",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 4,
                            fontSize: 11,
                            color: "#6b7280",
                          }}>
                            QR Code
                          </div>
                          <a
                            href={APP_STORE_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: 12, color: "var(--color-accent)", textDecoration: "none" }}
                          >
                            Open link instead
                          </a>
                        </div>
                      )}

                      <button
                        onClick={markAppInstalled}
                        style={{
                          fontSize: 12,
                          color: "var(--color-muted)",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                          padding: 0,
                        }}
                      >
                        I&apos;ve installed it →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* Standard step */
              <Link
                href={step.href || "#"}
                className="flex items-start gap-3 transition-colors"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 11,
                    fontWeight: 600,
                    flexShrink: 0,
                    marginTop: 2,
                    background: step.done ? "var(--color-success)" : "var(--color-surface-hover)",
                    color: step.done ? "#fff" : "var(--color-muted)",
                  }}
                >
                  {step.done ? "✓" : ""}
                </span>
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

            {/* Show missing platforms inline */}
            {"missing" in step && step.missing && (step.missing as string[]).length > 0 && !step.done && (
              <div style={{ marginLeft: 32, marginTop: 6 }}>
                {(step.missing as string[]).map((platform) => (
                  <div
                    key={platform}
                    style={{
                      fontSize: 13,
                      color: "var(--color-muted)",
                      padding: "3px 0",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-warning)", flexShrink: 0 }} />
                    {PLATFORM_LABELS[platform] || platform}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Autopilot status */}
        <div
          style={{
            marginTop: 16,
            padding: "12px",
            borderRadius: "var(--tp-radius)",
            background: allDone ? "rgba(34, 197, 94, 0.1)" : "var(--color-surface-hover)",
          }}
        >
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
                {steps.length - completedCount} step{steps.length - completedCount !== 1 ? "s" : ""} remaining
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
