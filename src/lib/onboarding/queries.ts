/**
 * Onboarding submission queries — load by token, save step data,
 * mark submitted, etc. Pure data layer, no business logic.
 */
import "server-only";
import { sql } from "@/lib/db";
import { generateOnboardingToken } from "./token";

export interface OnboardingSubmission {
  id: string;
  subscription_id: string;
  token: string;
  current_step: number;
  data: Record<string, unknown>;
  platform_status: Record<string, "connected" | "creating" | "skipped" | "failed">;
  created_at: Date;
  updated_at: Date;
  submitted_at: Date | null;
  completed_at: Date | null;
  expires_at: Date;
}

export async function createSubmission(subscriptionId: string): Promise<OnboardingSubmission> {
  const token = generateOnboardingToken();
  const [row] = await sql`
    INSERT INTO onboarding_submissions (subscription_id, token)
    VALUES (${subscriptionId}, ${token})
    RETURNING *
  `;
  return row as unknown as OnboardingSubmission;
}

export async function getByToken(token: string): Promise<OnboardingSubmission | null> {
  const [row] = await sql`
    SELECT * FROM onboarding_submissions
    WHERE token = ${token}
    LIMIT 1
  `;
  return (row as unknown as OnboardingSubmission) || null;
}

export async function isExpired(submission: OnboardingSubmission): boolean {
  return new Date(submission.expires_at).getTime() < Date.now();
}

export async function saveStep(
  token: string,
  stepNumber: number,
  stepData: Record<string, unknown>
): Promise<OnboardingSubmission | null> {
  const [row] = await sql`
    UPDATE onboarding_submissions
    SET current_step = GREATEST(current_step, ${stepNumber}),
        data = data || ${JSON.stringify(stepData)}::jsonb,
        updated_at = NOW()
    WHERE token = ${token} AND completed_at IS NULL
    RETURNING *
  `;
  return (row as unknown as OnboardingSubmission) || null;
}

export async function setPlatformStatus(
  token: string,
  platform: string,
  status: "connected" | "creating" | "skipped" | "failed"
): Promise<void> {
  await sql`
    UPDATE onboarding_submissions
    SET platform_status = platform_status || ${JSON.stringify({ [platform]: status })}::jsonb,
        updated_at = NOW()
    WHERE token = ${token}
  `;
}

export async function markSubmitted(token: string): Promise<OnboardingSubmission | null> {
  const [row] = await sql`
    UPDATE onboarding_submissions
    SET submitted_at = NOW(), updated_at = NOW()
    WHERE token = ${token} AND submitted_at IS NULL
    RETURNING *
  `;
  return (row as unknown as OnboardingSubmission) || null;
}

export async function markCompleted(token: string): Promise<OnboardingSubmission | null> {
  const [row] = await sql`
    UPDATE onboarding_submissions
    SET completed_at = NOW(), updated_at = NOW()
    WHERE token = ${token}
    RETURNING *
  `;
  return (row as unknown as OnboardingSubmission) || null;
}
