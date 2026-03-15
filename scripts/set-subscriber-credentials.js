/**
 * Set email + password for existing subscribers.
 *
 * Usage: node scripts/set-subscriber-credentials.js
 */

const { neon } = require("@neondatabase/serverless");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: ".env.local" });

async function main() {
  const sql = neon(process.env.DATABASE_URL);

  const credentials = [
    { name: "B2 Construction", email: "carlvbroussard@gmail.com", password: "b2construction" },
    { name: "Hektor K9", email: "carl@retailspec.com", password: "hektork9" },
  ];

  for (const cred of credentials) {
    const hash = await bcrypt.hash(cred.password, 10);
    const result = await sql`
      UPDATE subscribers
      SET email = ${cred.email}, password_hash = ${hash}
      WHERE name = ${cred.name}
      RETURNING id, name, email
    `;
    if (result.length > 0) {
      console.log(`Set credentials for ${result[0].name} (${result[0].email})`);
    } else {
      console.log(`Subscriber "${cred.name}" not found`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
