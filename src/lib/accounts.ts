import { randomBytes, randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { sql } from "./db";
import { hashApiKey } from "./auth";

export type AccountType = "direct" | "agency" | "client";

export interface CreateAccountInput {
  type: AccountType;
  /** Required for `client` (the managing agency's account); null otherwise. */
  parentAccountId?: string | null;
  plan?: string;
  /** The account/company name (lives on accounts.name, not the owner user). */
  name?: string | null;
  /**
   * The account owner. REQUIRED for `direct`/`agency` (they're the customer);
   * OPTIONAL for `client` (agency-owned clients have no owner — they're operated
   * via the agency's parent cascade, with capture/reviewer members for uploads).
   * When present, the owner gets the account-scope `admin` membership (= owner).
   */
  owner?: { name: string; email?: string | null; password?: string | null; phone?: string | null };
  isTest?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CreateAccountResult {
  accountId: string;
  ownerUserId: string | null;
  apiKey: string;
}

/**
 * The single source of truth for creating an account. Replaces the divergent
 * inline INSERTs in onboarding/start, stripe/webhook, and the admin create route.
 *
 * One atomic transaction:
 *   1. INSERT accounts (type, parent_account_id, plan, name, is_test, metadata, api_key_hash)
 *   2. if owner: INSERT owner user + an account-scope `admin` membership (= the owner)
 *
 * Owner rules: required for direct/agency, optional for client. Billing is a
 * SEPARATE layer and is intentionally NOT encoded here.
 *
 * Ownership model (decision B, 2026-05-29): the account-scope admin membership
 * is the AUTHORITATIVE owner; accounts.owner_user_id is a denormalized owner
 * pointer kept in sync with it (a query convenience, deliberately retained — not
 * a transitional artifact). This sets both atomically.
 */
export async function createAccount(input: CreateAccountInput): Promise<CreateAccountResult> {
  const {
    type,
    parentAccountId = null,
    plan = "free",
    name = null,
    owner,
    isTest = false,
    metadata,
  } = input;

  // Invariants (the DB also enforces client-type CHECK + ≤1 admin per account)
  if (type === "client" && !parentAccountId) {
    throw new Error("createAccount: a client account requires parentAccountId");
  }
  if ((type === "direct" || type === "agency") && !owner) {
    throw new Error(`createAccount: a ${type} account requires an owner`);
  }

  const apiKey = `tp_${randomBytes(24).toString("hex")}`;
  const apiKeyHash = await hashApiKey(apiKey);
  const passwordHash = owner?.password ? await bcrypt.hash(owner.password, 10) : null;

  // Pre-generate ids so the whole thing runs as one neon-http transaction
  // (no RETURNING chaining needed).
  const accountId = randomUUID();
  const ownerUserId = owner ? randomUUID() : null;
  const metadataJson = JSON.stringify(metadata ?? {});

  const queries = [
    sql`
      INSERT INTO accounts
        (id, type, parent_account_id, plan, name, is_active, is_test, metadata, api_key_hash)
      VALUES
        (${accountId}, ${type}, ${parentAccountId}, ${plan}, ${name}, true, ${isTest}, ${metadataJson}::jsonb, ${apiKeyHash})
    `,
  ];

  if (owner && ownerUserId) {
    queries.push(
      sql`
        INSERT INTO users (id, billing_account_id, name, email, phone, password_hash, is_active)
        VALUES (${ownerUserId}, ${accountId}, ${owner.name}, ${owner.email ?? null}, ${owner.phone ?? null}, ${passwordHash}, true)
      `,
      // Account-scope admin membership = the owner (the v3 ownership source of truth).
      sql`
        INSERT INTO memberships (user_id, scope_type, scope_id, role, capability)
        VALUES (${ownerUserId}, 'account', ${accountId}, 'admin', NULL)
      `,
      // Keep the denormalized owner_user_id FK in sync with the (authoritative)
      // account-admin membership — a query convenience, deliberately retained.
      sql`UPDATE accounts SET owner_user_id = ${ownerUserId} WHERE id = ${accountId}`,
    );
  }

  await sql.transaction(queries);

  return { accountId, ownerUserId, apiKey };
}
