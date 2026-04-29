/**
 * OTP gate helpers — for protected owner-only actions that require
 * email-OTP step-up confirmation before committing.
 *
 * Pattern: the destructive endpoint accepts `{ otp_code, ... }` in its body.
 *   - If `otp_code` is missing, the endpoint calls `requireOtpAndRespond()`
 *     which sends a fresh OTP to the user's email and returns a 401-shaped
 *     response telling the client to prompt for a code.
 *   - If `otp_code` is present, the endpoint calls `consumeOtp()` which
 *     verifies the code and clears it on success. If invalid, the endpoint
 *     returns 401 and lets the client re-prompt.
 *
 * The OTP code itself is the proof of recent verification. No separate
 * verification token is issued — keeps the surface small and avoids
 * token-replay risk.
 */
import { NextResponse } from "next/server";
import { sendOtp, verifyOtp } from "./otp";

/**
 * Send an OTP to the user's email and return a 401 response telling the
 * client to prompt the user for the code.
 */
export async function requireOtpAndRespond(
  userId: string,
  action: string
): Promise<NextResponse> {
  const sent = await sendOtp(userId, action);
  if (!sent) {
    return NextResponse.json(
      { error: "Could not send verification code. Please try again." },
      { status: 500 }
    );
  }
  return NextResponse.json(
    {
      otp_required: true,
      action,
      message: "We sent a 6-digit verification code to your email. Enter it to confirm.",
    },
    { status: 401 }
  );
}

/**
 * Verify a submitted OTP code and clear it on success. Returns true if
 * valid. The destructive action should ONLY proceed when this returns true.
 */
export async function consumeOtp(
  userId: string,
  action: string,
  code: string | undefined
): Promise<boolean> {
  if (!code) return false;
  return verifyOtp(userId, code, action);
}

/**
 * Convenience wrapper: handle the full OTP gate in one call.
 *
 * Usage in a route handler:
 *   const otpResult = await otpGate(auth.userId, "cancel_subscription", body.otp_code);
 *   if (otpResult) return otpResult; // 401 with otp_required:true OR invalid-code error
 *   // ...proceed with destructive action
 *
 * Returns:
 *   - `null` if OTP is verified and the action may proceed
 *   - `NextResponse` (401) if OTP needs to be sent or was invalid; caller
 *     should return it directly
 */
export async function otpGate(
  userId: string,
  action: string,
  code: string | undefined
): Promise<NextResponse | null> {
  if (!code) {
    return requireOtpAndRespond(userId, action);
  }
  const valid = await consumeOtp(userId, action, code);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid or expired verification code", otp_required: true, action },
      { status: 401 }
    );
  }
  return null;
}
