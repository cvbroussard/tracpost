"use client";

import { useState } from "react";

/**
 * Two-axis privacy settings panel.
 *
 * Faces (likeness) and Identity (names) are independent. Each axis has
 * a conservative default that needs no waiver, and a permissive option
 * that requires the subscriber to sign an explicit waiver. Once signed,
 * the waiver record persists for audit even if subscriber reverts to
 * the conservative option later.
 *
 * UI: two cards, each with policy radios + waiver state + sign/revoke
 * affordance. Permissive options open a waiver modal before applying.
 */

interface AxisState {
  policy: string;
  waiver_signed_at: string | null;
  waiver_version: string | null;
}

interface Props {
  siteId: string;
  initial: { face: AxisState; identity: AxisState };
}

const FACE_OPTIONS: Array<{ value: string; label: string; description: string; requiresWaiver: boolean }> = [
  {
    value: "asis",
    label: "Publish faces unaltered (default)",
    description:
      "Standard for most businesses. Crew photos, client testimonials, event recaps publish with faces as-is — matches normal industry practice. Because TracPost's autopilot is the publisher-of-record, you sign a one-time waiver acknowledging you have consent for the people in your uploads.",
    requiresWaiver: true,
  },
  {
    value: "blur",
    label: "Blur faces",
    description:
      "Every detected face is gaussian-blurred. Opt into this if your industry has stricter privacy norms — childcare, healthcare, addiction recovery, before/after cosmetic, litigation-prone fields. The conservative posture is its own protection; no waiver needed.",
    requiresWaiver: false,
  },
  {
    value: "box",
    label: "Rectangle overlay",
    description:
      "Each detected face is covered by a solid rectangle. Editorial / stylistic choice that preserves anonymity while showing people are present.",
    requiresWaiver: false,
  },
  {
    value: "suppress",
    label: "Don't publish images with faces",
    description:
      "Assets with detected faces are quarantined from autopilot publishing. Most conservative; you'd manually compose for the rare face-OK shot.",
    requiresWaiver: false,
  },
];

const IDENTITY_OPTIONS: Array<{ value: string; label: string; description: string; requiresWaiver: boolean }> = [
  {
    value: "allow_names",
    label: "Use proper names (default)",
    description:
      "Captions preserve real names from your transcripts (\"Mike installed the new cabinets\"). Matches normal business practice for crew attribution and testimonials. Your audio + transcript is the consent record — you mentioned the name in your own voice. One-time waiver acknowledges publisher-of-record responsibility.",
    requiresWaiver: true,
  },
  {
    value: "anonymize",
    label: "Anonymize names",
    description:
      "Captions substitute generic role descriptors (\"our client installed her new cabinets\") even when you mention real names. Opt into this if your industry handles sensitive client relationships or you prefer not to expose individuals by name in published copy.",
    requiresWaiver: false,
  },
];

export function PrivacyPanel({ siteId, initial }: Props) {
  const [face, setFace] = useState<AxisState>(initial.face);
  const [identity, setIdentity] = useState<AxisState>(initial.identity);
  const [waiverModal, setWaiverModal] = useState<"face" | "identity" | null>(null);
  const [pendingPolicy, setPendingPolicy] = useState<string | null>(null);
  const [waiverChecked, setWaiverChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function savePolicy(opts: {
    face_policy?: string;
    identity_policy?: string;
    sign_face_waiver?: boolean;
    sign_identity_waiver?: boolean;
  }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/site/privacy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId, ...opts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      // Refetch to pick up server-stamped waiver timestamps
      const fresh = await fetch(`/api/site/privacy?site_id=${siteId}`);
      const freshData = await fresh.json();
      setFace(freshData.face);
      setIdentity(freshData.identity);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleFaceChange(nextValue: string) {
    const opt = FACE_OPTIONS.find((o) => o.value === nextValue);
    if (!opt) return;
    if (opt.requiresWaiver && !face.waiver_signed_at) {
      setPendingPolicy(nextValue);
      setWaiverModal("face");
      setWaiverChecked(false);
      return;
    }
    void savePolicy({ face_policy: nextValue });
  }

  function handleIdentityChange(nextValue: string) {
    const opt = IDENTITY_OPTIONS.find((o) => o.value === nextValue);
    if (!opt) return;
    if (opt.requiresWaiver && !identity.waiver_signed_at) {
      setPendingPolicy(nextValue);
      setWaiverModal("identity");
      setWaiverChecked(false);
      return;
    }
    void savePolicy({ identity_policy: nextValue });
  }

  function confirmWaiver() {
    if (!waiverChecked || !pendingPolicy) return;
    if (waiverModal === "face") {
      void savePolicy({ face_policy: pendingPolicy, sign_face_waiver: true });
    } else if (waiverModal === "identity") {
      void savePolicy({ identity_policy: pendingPolicy, sign_identity_waiver: true });
    }
    setWaiverModal(null);
    setPendingPolicy(null);
  }

  function cancelWaiver() {
    setWaiverModal(null);
    setPendingPolicy(null);
    setWaiverChecked(false);
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <AxisCard
        title="Faces in images"
        currentPolicy={face.policy}
        options={FACE_OPTIONS}
        waiverSignedAt={face.waiver_signed_at}
        waiverVersion={face.waiver_version}
        onChange={handleFaceChange}
        disabled={saving}
      />

      <AxisCard
        title="Names in captions"
        currentPolicy={identity.policy}
        options={IDENTITY_OPTIONS}
        waiverSignedAt={identity.waiver_signed_at}
        waiverVersion={identity.waiver_version}
        onChange={handleIdentityChange}
        disabled={saving}
      />

      {waiverModal && (
        <WaiverModal
          axis={waiverModal}
          checked={waiverChecked}
          onCheckedChange={setWaiverChecked}
          onConfirm={confirmWaiver}
          onCancel={cancelWaiver}
        />
      )}
    </div>
  );
}

function AxisCard({
  title,
  currentPolicy,
  options,
  waiverSignedAt,
  waiverVersion,
  onChange,
  disabled,
}: {
  title: string;
  currentPolicy: string;
  options: Array<{ value: string; label: string; description: string; requiresWaiver: boolean }>;
  waiverSignedAt: string | null;
  waiverVersion: string | null;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <div className="space-y-2">
        {options.map((opt) => {
          const isCurrent = opt.value === currentPolicy;
          return (
            <label
              key={opt.value}
              className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 transition-colors ${
                isCurrent
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-border-strong"
              }`}
            >
              <input
                type="radio"
                checked={isCurrent}
                onChange={() => onChange(opt.value)}
                disabled={disabled}
                className="mt-0.5 cursor-pointer accent-accent"
              />
              <div className="flex-1 text-xs">
                <div className="font-medium">
                  {opt.label}
                  {opt.requiresWaiver && (
                    <span className="ml-1.5 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning">
                      waiver required
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-muted">{opt.description}</p>
              </div>
            </label>
          );
        })}
      </div>
      {waiverSignedAt && (
        <p className="mt-3 text-[10px] text-muted">
          Waiver signed {new Date(waiverSignedAt).toLocaleString()}{" "}
          {waiverVersion && <span className="opacity-60">({waiverVersion})</span>}
        </p>
      )}
    </section>
  );
}

function WaiverModal({
  axis,
  checked,
  onCheckedChange,
  onConfirm,
  onCancel,
}: {
  axis: "face" | "identity";
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isFace = axis === "face";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-w-md rounded-lg bg-background p-5 shadow-lg">
        <h3 className="mb-2 text-sm font-semibold">
          {isFace ? "Publish faces unaltered — waiver" : "Use proper names in captions — waiver"}
        </h3>
        <div className="space-y-2 text-xs text-muted">
          <p>
            You are about to opt into the permissive option for{" "}
            {isFace ? "face publishing" : "identity attribution"}.
          </p>
          {isFace ? (
            <>
              <p>
                TracPost will publish images with detected faces appearing as-is, without blur or
                rectangle overlay. You are solely responsible for obtaining any necessary consent
                from people whose faces appear in your published content.
              </p>
              <p>
                TracPost makes no claims about, and assumes no liability for, the consent status
                of any individual whose face appears in your uploaded images. By signing this
                waiver, you agree that any privacy claims, takedown requests, or legal disputes
                arising from published faces are your responsibility to resolve.
              </p>
            </>
          ) : (
            <>
              <p>
                TracPost&apos;s caption generator will preserve proper names from your audio
                transcripts in published copy (e.g. &quot;Mary Johnson loved her new addition&quot;
                rather than &quot;our client loved her new addition&quot;).
              </p>
              <p>
                Your audio recordings and transcripts serve as the consent record — you mentioned
                these names in your own voice. TracPost retains your audio and transcripts as
                evidence that the name attribution originated with you. You are solely responsible
                for any privacy claims arising from published name mentions.
              </p>
            </>
          )}
          <p className="text-foreground">You can revoke this waiver at any time by switching back to the conservative option above.</p>
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            className="mt-0.5 cursor-pointer accent-accent"
          />
          <span>
            I have read the waiver and accept full responsibility for{" "}
            {isFace ? "published face content" : "published name mentions"}.
          </span>
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!checked}
            className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
          >
            Sign waiver and continue
          </button>
        </div>
      </div>
    </div>
  );
}
