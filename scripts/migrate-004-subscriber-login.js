/**
 * Migration 004: Add email + password_hash to subscribers for dashboard login.
 *
 * API keys remain for programmatic API auth (Bearer token).
 * Dashboard login uses email + password with session cookie.
 */

const { neon } = require("@neondatabase/serverless");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  console.log("Adding email and password_hash columns to subscribers...");
  await sql`
    ALTER TABLE subscribers
    ADD COLUMN IF NOT EXISTS email TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS password_hash TEXT
  `;

  console.log("Done. Set email + password for each subscriber to enable dashboard login.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
