"use client";

import { useState } from "react";
import { PhoneE164Field } from "@/components/forms";

interface Props {
  userId: string;
  initialName: string;
  initialEmail: string;
  initialPhone: string;
  hasPassword: boolean;
}

export function AccountProfile({ userId, initialName, initialEmail, initialPhone, hasPassword }: Props) {
  const [ownerName, setOwnerName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [emailBaseline, setEmailBaseline] = useState(initialEmail);
  const [companyPhone, setCompanyPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);
  const [ownerNameSuccess, setOwnerNameSuccess] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [companyPhoneSuccess, setCompanyPhoneSuccess] = useState(false);

  // Password flow
  const [showPassword, setShowPassword] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpVerified, setOtpVerified] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  async function saveCompanyPhone() {
    if (companyPhone === initialPhone) return;
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
    if (!ownerName.trim() || ownerName === initialName) return;
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

  async function saveEmail() {
    const trimmed = email.trim();
    if (!trimmed || trimmed === emailBaseline) return;
    setSaving(true);
    setEmailSuccess(false);
    setEmailError(null);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (res.ok) {
        setEmailBaseline(trimmed);
        setEmailSuccess(true);
        setTimeout(() => setEmailSuccess(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        setEmailError(data.error || "Failed to update email");
      }
    } catch {
      setEmailError("Request failed");
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
      {/* Name */}
      <div className="flex items-center justify-between border-b border-border py-2">
        <span className="text-sm text-muted">Name</span>
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
            disabled={saving || !ownerName.trim() || ownerName === initialName}
            className="border border-border px-3 py-1 text-sm text-muted hover:text-foreground disabled:opacity-30"
          >
            {saving ? "..." : ownerNameSuccess ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* Email */}
      <div className="border-b border-border py-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">Email</span>
          <div className="flex items-center gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
              className="px-2 py-1 text-right"
              style={{ width: 260 }}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <button
              onClick={saveEmail}
              disabled={saving || !email.trim() || email.trim() === emailBaseline}
              className="border border-border px-3 py-1 text-sm text-muted hover:text-foreground disabled:opacity-30"
            >
              {saving ? "..." : emailSuccess ? "Saved" : "Save"}
            </button>
          </div>
        </div>
        {emailError && <p className="mt-1 text-right text-xs text-danger">{emailError}</p>}
        <p className="mt-1 text-right text-[10px] text-dim">
          Used for login and notifications. Changing it doesn&rsquo;t sign you out.
        </p>
      </div>

      {/* Phone */}
      <div className="flex items-center justify-between border-b border-border py-2">
        <span className="text-sm text-muted">Phone</span>
        <div className="flex items-center gap-2">
          <PhoneE164Field
            value={companyPhone}
            onChange={setCompanyPhone}
            ariaLabel="Phone"
          />
          <button
            onClick={saveCompanyPhone}
            disabled={saving || companyPhone === initialPhone}
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
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      className="w-full px-3 py-2.5 pr-14"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-foreground"
                    >
                      {showNewPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">Confirm password</label>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm your password"
                      className="w-full px-3 py-2.5 pr-14"
                    />
                  </div>
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
