"use client";

import { useState } from "react";
import { PhoneField } from "@/components/phone-input";

interface Props {
  subscriberId: string;
  initialName: string;
  initialOwnerName: string;
  initialCompanyPhone: string;
  hasPassword: boolean;
}

export function AccountProfile({ subscriberId, initialName, initialOwnerName, initialCompanyPhone, hasPassword }: Props) {
  const [name, setName] = useState(initialName);
  const [ownerName, setOwnerName] = useState(initialOwnerName);
  const [companyPhone, setCompanyPhone] = useState(initialCompanyPhone);
  const [saving, setSaving] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);
  const [ownerNameSuccess, setOwnerNameSuccess] = useState(false);
  const [companyPhoneSuccess, setCompanyPhoneSuccess] = useState(false);

  // Password flow
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  async function saveCompanyPhone() {
    if (companyPhone === initialCompanyPhone) return;
    setSaving(true);
    setCompanyPhoneSuccess(false);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyPhone: companyPhone.trim() }),
      });
      if (res.ok) {
        setCompanyPhoneSuccess(true);
        setTimeout(() => setCompanyPhoneSuccess(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveOwnerName() {
    if (!ownerName.trim() || ownerName === initialOwnerName) return;
    setSaving(true);
    setOwnerNameSuccess(false);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerName: ownerName.trim() }),
      });
      if (res.ok) {
        setOwnerNameSuccess(true);
        setTimeout(() => setOwnerNameSuccess(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }



  async function saveName() {
    if (!name.trim() || name === initialName) return;
    setSaving(true);
    setNameSuccess(false);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setNameSuccess(true);
        // Refresh session to reflect name change
        await fetch("/api/auth/refresh-session", { method: "POST" });
        setTimeout(() => setNameSuccess(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function requestOtp() {
    setPasswordLoading(true);
    setPasswordError("");
    try {
      const res = await fetch("/api/account/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", purpose: "change_password" }),
      });
      if (res.ok) {
        setOtpSent(true);
      } else {
        const data = await res.json();
        setPasswordError(data.error || "Failed to send code");
      }
    } finally {
      setPasswordLoading(false);
    }
  }

  async function verifyCode() {
    setPasswordLoading(true);
    setPasswordError("");
    try {
      const res = await fetch("/api/account/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code: otpCode, purpose: "change_password" }),
      });
      if (res.ok) {
        setOtpVerified(true);
      } else {
        setPasswordError("Invalid or expired code");
      }
    } finally {
      setPasswordLoading(false);
    }
  }

  async function savePassword() {
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match");
      return;
    }

    setPasswordLoading(true);
    setPasswordError("");
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      });
      if (res.ok) {
        setPasswordSuccess(true);
        setShowPassword(false);
        setOtpSent(false);
        setOtpVerified(false);
        setOtpCode("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => setPasswordSuccess(false), 3000);
      } else {
        const data = await res.json();
        setPasswordError(data.error || "Failed to set password");
      }
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <>
      {/* Owner name */}
      <div className="flex items-center justify-between border-b border-border py-2">
        <span className="text-sm text-muted">Your name</span>
        <div className="flex items-center gap-2">
          <input
            value={ownerName}
            onChange={(e) => setOwnerName(e.target.value)}
            className="px-2 py-1 text-right"
            style={{ width: 200 }}
            placeholder="Your full name"
          />
          <button
            onClick={saveOwnerName}
            disabled={saving || !ownerName.trim() || ownerName === initialOwnerName}
            className="border border-border px-3 py-1 text-sm text-muted hover:text-foreground disabled:opacity-30"
          >
            {saving ? "..." : ownerNameSuccess ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* Business name */}
      <div className="flex items-center justify-between border-b border-border py-2">
        <span className="text-sm text-muted">Business name</span>
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="px-2 py-1 text-right"
            style={{ width: 200 }}
          />
          <button
            onClick={saveName}
            disabled={saving || !name.trim() || name === initialName}
            className="border border-border px-3 py-1 text-sm text-muted hover:text-foreground disabled:opacity-30"
          >
            {saving ? "..." : nameSuccess ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* Company phone */}
      <div className="flex items-center justify-between border-b border-border py-2">
        <span className="text-sm text-muted">Company phone</span>
        <div className="flex items-center gap-2">
          <PhoneField
            value={companyPhone}
            onChange={setCompanyPhone}
            className="px-2 py-1"
            style={{ width: 180 }}
          />
          <button
            onClick={saveCompanyPhone}
            disabled={saving || companyPhone === initialCompanyPhone}
            className="border border-border px-3 py-1 text-sm text-muted hover:text-foreground disabled:opacity-30"
          >
            {saving ? "..." : companyPhoneSuccess ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* Password */}
      <div className="border-b border-border py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Password</span>
          <div className="flex items-center gap-2">
            <span className="text-sm">
              {hasPassword ? "••••••••" : "Not set"}
            </span>
            <button
              onClick={() => setShowPassword(!showPassword)}
              className="border border-border px-3 py-1 text-sm text-muted hover:text-foreground"
            >
              {hasPassword ? "Change" : "Set password"}
            </button>
          </div>
        </div>

        {showPassword && (
          <div style={{ marginTop: 12, paddingLeft: 0 }}>
            {passwordError && (
              <p className="mb-3 text-sm text-danger">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="mb-3 text-sm text-success">Password updated</p>
            )}

            {/* Step 1: Request OTP */}
            {!otpSent && !otpVerified && (
              <div>
                <p className="mb-3 text-sm text-muted">
                  We'll send a verification code to your email to confirm your identity.
                </p>
                <button
                  onClick={requestOtp}
                  disabled={passwordLoading}
                  className="bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {passwordLoading ? "Sending..." : "Send verification code"}
                </button>
              </div>
            )}

            {/* Step 2: Enter OTP */}
            {otpSent && !otpVerified && (
              <div>
                <p className="mb-3 text-sm text-muted">
                  Enter the 6-digit code sent to your email.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    className="px-3 py-2 font-mono"
                    style={{ width: 120, letterSpacing: 4, textAlign: "center" }}
                  />
                  <button
                    onClick={verifyCode}
                    disabled={passwordLoading || otpCode.length !== 6}
                    className="bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {passwordLoading ? "..." : "Verify"}
                  </button>
                </div>
                <button
                  onClick={requestOtp}
                  disabled={passwordLoading}
                  className="mt-2 text-sm text-muted hover:text-foreground"
                >
                  Resend code
                </button>
              </div>
            )}

            {/* Step 3: Set new password */}
            {otpVerified && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">New password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full px-3 py-2.5"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Confirm password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className="w-full px-3 py-2.5"
                  />
                </div>
                <button
                  onClick={savePassword}
                  disabled={passwordLoading || newPassword.length < 8}
                  className="bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {passwordLoading ? "Saving..." : "Save password"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
